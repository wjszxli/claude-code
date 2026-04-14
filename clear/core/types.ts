/**
 * 核心类型系统
 * 简化自 src/types/ 下的 message.ts, permissions.ts, tools.ts
 *
 * 三层类型架构:
 *   1. Message - 消息模型 (用户 ↔ LLM ↔ 工具 之间的通信)
 *   2. Permission - 权限决策模型 (allow/deny/ask 三态决策)
 *   3. Task - 异步任务模型 (后台任务的生命周期)
 */

// ────────────────────────────────────────────
// 1. Message Types
// ────────────────────────────────────────────

/** 消息角色 */
export type MessageRole = 'user' | 'assistant' | 'system'

/** 用户消息 */
export type UserMessage = {
  role: 'user'
  content: string
  timestamp: number
}

/** 助手消息 (LLM 响应) */
export type AssistantMessage = {
  role: 'assistant'
  content: AssistantContent[]
  timestamp: number
  model?: string
}

/** 助手消息内容块 — 区分文本输出和工具调用 */
export type AssistantContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }

/** 系统消息 */
export type SystemMessage = {
  role: 'system'
  content: string
  timestamp: number
}

/** 工具结果消息 */
export type ToolResultMessage = {
  role: 'tool_result'
  toolUseId: string
  content: string
  isError: boolean
}

/** 统一消息类型 */
export type Message =
  | UserMessage
  | AssistantMessage
  | SystemMessage
  | ToolResultMessage

// ────────────────────────────────────────────
// 2. Permission Types
// ────────────────────────────────────────────

/** 权限模式
 *  default: 标准模式，敏感操作需确认
 *  auto:    自动批准安全操作
 *  plan:    计划模式，受限执行
 *  bypass:  跳过所有权限检查
 */
export type PermissionMode = 'default' | 'auto' | 'plan' | 'bypass'

/** 权限行为 — 三态决策 */
export type PermissionBehavior = 'allow' | 'deny' | 'ask'

/** 权限规则来源 */
export type PermissionRuleSource =
  | 'userSettings'    // 用户全局设置 (~/.claude/settings.json)
  | 'projectSettings' // 项目设置 (.claude/settings.json)
  | 'localSettings'   // 本地设置 (.claude/settings.local.json)
  | 'session'         // 会话级临时规则

/** 权限规则 — 匹配工具名 + 可选的内容模式 */
export type PermissionRule = {
  source: PermissionRuleSource
  behavior: PermissionBehavior
  toolName: string
  ruleContent?: string // e.g. "git *" 表示匹配 git 开头的命令
}

/** 权限决策 — discriminated union */
export type PermissionDecision<Input = Record<string, unknown>> =
  | { behavior: 'allow'; updatedInput?: Input }
  | { behavior: 'deny'; message: string }
  | { behavior: 'ask'; message: string; updatedInput?: Input }

/** 权限上下文 — 传入工具权限检查的完整上下文 */
export type PermissionContext = {
  mode: PermissionMode
  alwaysAllowRules: PermissionRule[]
  alwaysDenyRules: PermissionRule[]
  alwaysAskRules: PermissionRule[]
}

// ────────────────────────────────────────────
// 3. Task Types
// ────────────────────────────────────────────

/** 任务类型 */
export type TaskType =
  | 'local_bash'     // 本地 Shell 命令
  | 'local_agent'    // 本地子代理
  | 'remote_agent'   // 远程代理
  | 'dream'          // 后台推理任务

/** 任务状态 — 线性状态机 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'killed'

/** 任务状态是否为终态 */
export function isTerminalStatus(status: TaskStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'killed'
}

/** 任务状态快照 */
export type TaskState = {
  id: string
  type: TaskType
  status: TaskStatus
  description: string
  startTime: number
  endTime?: number
}

// ────────────────────────────────────────────
// 4. Tool Result Types
// ────────────────────────────────────────────

/** 工具执行结果 */
export type ToolResult<T = unknown> = {
  data: T
  error?: string
}

/** 工具进度事件 */
export type ToolProgress =
  | { type: 'bash'; command: string; exitCode?: number }
  | { type: 'file_read'; path: string; bytes: number }
  | { type: 'file_write'; path: string; bytes: number }
  | { type: 'search'; pattern: string; matches: number }

// ────────────────────────────────────────────
// 5. API Types (简化)
// ────────────────────────────────────────────

/** API 用量统计 */
export type Usage = {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
}

/** API 响应 */
export type APIResponse = {
  message: AssistantMessage
  usage: Usage
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens'
  costUsd: number
}
