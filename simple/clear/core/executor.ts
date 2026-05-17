/**
 * 执行引擎 — 工具调用管线
 * 简化自 src/QueryEngine.ts (原文件 1700+ 行) 的工具执行部分
 *
 * 执行管线:
 *
 *   validateInput → checkPermission → call → updateState
 *        ↓              ↓             ↓          ↓
 *    输入校验       权限决策       工具执行    状态持久化
 *
 * 对应源码中 QueryEngine.handleToolUse() 的核心逻辑
 */

import type { Tool, Tools, ToolUseContext } from './tool.js'
import type {
  PermissionContext,
  PermissionDecision,
  ToolResult,
  AssistantContent,
  ToolResultMessage,
} from './types.js'
import { checkPermission } from './permissions.js'
import { createStateStore, type AppState } from './state.js'
import { findToolByName } from './tool.js'

// ────────────────────────────────────────────
// Execution Context — 执行上下文
// ────────────────────────────────────────────

/** 执行上下文 — 包装工具执行所需的所有依赖 */
export type ExecutionContext = {
  /** 工具注册表 */
  tools: Tools
  /** 权限上下文 */
  permissionContext: PermissionContext
  /** 状态 Store */
  store: ReturnType<typeof createStateStore>
  /** 中断控制器 */
  abortController: AbortController
  /** 消息列表 (可变引用) */
  messages: unknown[]
}

/** 创建执行上下文 */
export function createExecutionContext(
  tools: Tools = [],
  permissionContext?: PermissionContext,
): ExecutionContext {
  return {
    tools,
    permissionContext: permissionContext ?? { mode: 'default', alwaysAllowRules: [], alwaysDenyRules: [], alwaysAskRules: [] },
    store: createStateStore(),
    abortController: new AbortController(),
    messages: [],
  }
}

// ────────────────────────────────────────────
// Tool Execution — 工具执行
// ────────────────────────────────────────────

/** 执行错误 */
export class ToolExecutionError extends Error {
  constructor(
    public readonly toolName: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(`[${toolName}] ${message}`)
    this.name = 'ToolExecutionError'
  }
}

/** 执行结果 */
export type ExecutionResult = {
  success: boolean
  toolName: string
  result?: ToolResult
  error?: string
  permissionDecision?: PermissionDecision
}

/**
 * executeToolCall — 执行单个工具调用
 *
 * 完整执行管线:
 *   1. 查找工具
 *   2. 验证输入 (validateInput)
 *   3. 权限检查 (checkPermission)
 *   4. 执行工具 (call)
 *   5. 更新状态 (setAppState)
 *
 * 对应源码 QueryEngine 中 handleToolUse → validateAndExecuteTool 流程
 */
export async function executeToolCall(
  toolName: string,
  input: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  // Step 1: 查找工具
  const tool = findToolByName(ctx.tools, toolName)
  if (!tool) {
    return {
      success: false,
      toolName,
      error: `Tool not found: ${toolName}`,
    }
  }

  // Step 2: 输入验证
  if (tool.validateInput) {
    const validation = await tool.validateInput(input, createToolUseContext(ctx))
    if (validation.result === false) {
      return {
        success: false,
        toolName,
        error: validation.message,
      }
    }
  }

  // Step 3: 权限检查
  const permission = await checkPermission(
    tool,
    input,
    ctx.permissionContext,
    createToolUseContext(ctx),
  )
  ctx.permissionDecision = permission

  if (permission.behavior === 'deny') {
    return {
      success: false,
      toolName,
      error: permission.message,
      permissionDecision: permission,
    }
  }

  // Step 4: 执行工具
  const effectiveInput = permission.behavior === 'allow' && permission.updatedInput
    ? permission.updatedInput
    : input

  try {
    const result = await tool.call(effectiveInput, createToolUseContext(ctx))

    // Step 5: 状态更新 — 追加工具结果到消息列表
    ctx.store.setState(state => ({
      ...state,
      messages: [...state.messages, {
        role: 'tool_result' as const,
        toolUseId: `tool_${Date.now()}`,
        content: JSON.stringify(result.data),
        isError: false,
      }],
    }))

    return { success: true, toolName, result, permissionDecision: permission }
  } catch (error) {
    return {
      success: false,
      toolName,
      error: error instanceof Error ? error.message : String(error),
      permissionDecision: permission,
    }
  }
}

// ────────────────────────────────────────────
// Batch Execution — 并发执行
// ────────────────────────────────────────────

/** 批量执行结果 */
export type BatchResult = {
  results: ExecutionResult[]
  allSucceeded: boolean
  durationMs: number
}

/**
 * executeToolCalls — 批量执行工具调用
 *
 * 并发策略:
 *   - isConcurrencySafe=true 的工具可并行执行
 *   - isConcurrencySafe=false 的工具串行执行
 *   - 对应源码中 QueryEngine 的 parallel tool execution
 */
export async function executeToolCalls(
  calls: Array<{ name: string; input: Record<string, unknown> }>,
  ctx: ExecutionContext,
): Promise<BatchResult> {
  const startTime = Date.now()

  // 分组: 并发安全 vs 串行
  const safeCalls: typeof calls = []
  const serialCalls: typeof calls = []

  for (const call of calls) {
    const tool = findToolByName(ctx.tools, call.name)
    if (tool?.isConcurrencySafe(call.input)) {
      safeCalls.push(call)
    } else {
      serialCalls.push(call)
    }
  }

  // 并发执行安全工具
  const safeResults = await Promise.all(
    safeCalls.map(call => executeToolCall(call.name, call.input, ctx))
  )

  // 串行执行不安全工具
  const serialResults: ExecutionResult[] = []
  for (const call of serialCalls) {
    const result = await executeToolCall(call.name, call.input, ctx)
    serialResults.push(result)
  }

  const results = [...safeResults, ...serialResults]
  return {
    results,
    allSucceeded: results.every(r => r.success),
    durationMs: Date.now() - startTime,
  }
}

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

/** 从 ExecutionContext 创建 ToolUseContext */
function createToolUseContext(ctx: ExecutionContext): ToolUseContext {
  return {
    abortController: ctx.abortController,
    getAppState: () => ctx.store.getState(),
    setAppState: (updater) => ctx.store.setState(updater),
    messages: ctx.messages,
    debug: false,
  }
}
