/**
 * 查询引擎 — 主循环
 * 简化自 src/query.ts + src/QueryEngine.ts (原文件合计 3000+ 行)
 *
 * 核心循环 (对应源码 QueryEngine.run()):
 *
 *   ┌─────────────────────────────────────────────────────┐
 *   │  userMessage                                         │
 *   │     ↓                                                │
 *   │  ┌──────────────┐                                   │
 *   │  │  API Call     │ ← system prompt + messages        │
 *   │  │  (streaming)  │                                   │
 *   │  └──────┬───────┘                                   │
 *   │         ↓                                            │
 *   │  stopReason?                                        │
 *   │  ├── end_turn    → 返回响应                          │
 *   │  ├── max_tokens  → 压缩上下文，继续                  │
 *   │  └── tool_use    → 执行工具，追加结果，继续循环       │
 *   │         ↓                                            │
 *   │  ┌──────────────┐                                   │
 *   │  │ executeTools  │                                  │
 *   │  └──────┬───────┘                                   │
 *   │         ↓                                            │
 *   │  返回循环顶部 (带上工具结果)                          │
 *   └─────────────────────────────────────────────────────┘
 */

import type { Tool, Tools } from '../core/tool.js'
import type {
  Message,
  UserMessage,
  AssistantMessage,
  AssistantContent,
  APIResponse,
  Usage,
} from '../core/types.js'
import type { ExecutionContext } from '../core/executor.js'
import { executeToolCalls } from '../core/executor.js'

// ────────────────────────────────────────────
// Query Types
// ────────────────────────────────────────────

/** 查询请求 */
export type QueryRequest = {
  /** 用户消息 */
  message: string
  /** 系统提示 */
  systemPrompt: string
  /** 可用工具 */
  tools: Tools
  /** 模型 */
  model?: string
  /** 最大轮次 (防止无限循环) */
  maxTurns?: number
}

/** 查询响应 */
export type QueryResponse = {
  /** 最终助手消息 */
  message: AssistantMessage
  /** 完整消息历史 */
  messages: Message[]
  /** 累计用量 */
  totalUsage: Usage
  /** 总轮次 */
  turns: number
  /** 总耗时 (ms) */
  durationMs: number
}

// ────────────────────────────────────────────
// Mock API Client — 模拟 API 调用
// ────────────────────────────────────────────

/**
 * APIClient — 模拟 Claude API 调用
 *
 * 真实项目中这部分在 src/services/api/claude.ts
 * 负责与 Anthropic API 通信，处理 streaming、retry、rate limit
 */
export type APIClient = {
  /** 发送消息并获取响应 */
  call(params: {
    messages: Message[]
    systemPrompt: string
    tools: Tools
    model: string
  }): Promise<APIResponse>
}

/** 创建模拟 API 客户端 (用于测试) */
export function createMockAPIClient(
  handler: (messages: Message[], tools: Tools) => AssistantContent[],
): APIClient {
  return {
    async call({ messages, tools }) {
      const content = handler(messages, tools)
      return {
        message: {
          role: 'assistant',
          content,
          timestamp: Date.now(),
        },
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
        },
        stopReason: content.some(c => c.type === 'tool_use') ? 'tool_use' : 'end_turn',
        costUsd: 0.001,
      }
    },
  }
}

// ────────────────────────────────────────────
// Query Engine — 主循环
// ────────────────────────────────────────────

/**
 * QueryEngine — 查询引擎
 *
 * 实现了 Claude Code 的核心循环:
 *   1. 接收用户消息
 *   2. 调用 API 获取 LLM 响应
 *   3. 如果响应包含工具调用 → 执行工具 → 追加结果 → 回到步骤 2
 *   4. 如果响应是最终回复 → 返回
 *
 * 对应源码: QueryEngine.run() / processToolCalls()
 */
export async function runQuery(
  request: QueryRequest,
  apiClient: APIClient,
  execCtx: ExecutionContext,
): Promise<QueryResponse> {
  const startTime = Date.now()
  const maxTurns = request.maxTurns ?? 10

  // 初始化消息列表
  const messages: Message[] = [{
    role: 'user',
    content: request.message,
    timestamp: Date.now(),
  }]

  let totalUsage: Usage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
  }

  let turns = 0
  let lastAssistantMessage: AssistantMessage | null = null

  // ── 主循环 ──
  while (turns < maxTurns) {
    turns++

    // 调用 API
    const response = await apiClient.call({
      messages,
      systemPrompt: request.systemPrompt,
      tools: request.tools,
      model: request.model ?? 'claude-sonnet-4-20250514',
    })

    // 累加用量
    totalUsage = {
      inputTokens: totalUsage.inputTokens + response.usage.inputTokens,
      outputTokens: totalUsage.outputTokens + response.usage.outputTokens,
      cacheCreationTokens: totalUsage.cacheCreationTokens + response.usage.cacheCreationTokens,
      cacheReadTokens: totalUsage.cacheReadTokens + response.usage.cacheReadTokens,
    }

    // 追加助手消息
    messages.push(response.message)
    lastAssistantMessage = response.message

    // 判断是否需要执行工具
    if (response.stopReason === 'tool_use') {
      // 提取工具调用
      const toolCalls = response.message.content
        .filter((c): c is Extract<AssistantContent, { type: 'tool_use' }> => c.type === 'tool_use')

      // 执行所有工具调用
      const batchResult = await executeToolCalls(
        toolCalls.map(tc => ({ name: tc.name, input: tc.input })),
        execCtx,
      )

      // 追加工具结果到消息列表
      for (const result of batchResult.results) {
        messages.push({
          role: 'tool_result',
          toolUseId: `tool_${Date.now()}_${result.toolName}`,
          content: result.success
            ? JSON.stringify(result.result?.data)
            : `Error: ${result.error}`,
          isError: !result.success,
        })
      }

      // 继续循环 (带上工具结果重新调用 API)
      continue
    }

    // end_turn 或 max_tokens → 结束循环
    break
  }

  if (!lastAssistantMessage) {
    throw new Error('No response from API')
  }

  return {
    message: lastAssistantMessage,
    messages,
    totalUsage,
    turns,
    durationMs: Date.now() - startTime,
  }
}

// ────────────────────────────────────────────
// Context Compression — 上下文压缩
// ────────────────────────────────────────────

/**
 * 压缩消息列表以适应 token 限制
 *
 * 对应源码 src/services/compact/compact.ts
 * 真实实现使用 LLM 生成摘要，这里简化为保留最近 N 条消息
 */
export function compressMessages(
  messages: Message[],
  maxMessages: number = 20,
): { messages: Message[]; wasCompressed: boolean } {
  if (messages.length <= maxMessages) {
    return { messages, wasCompressed: false }
  }

  // 保留系统消息 + 最近的消息
  const systemMsgs = messages.filter(m => m.role === 'system')
  const nonSystemMsgs = messages.filter(m => m.role !== 'system')
  const recentMsgs = nonSystemMsgs.slice(-maxMessages)

  return {
    messages: [...systemMsgs, ...recentMsgs],
    wasCompressed: true,
  }
}
