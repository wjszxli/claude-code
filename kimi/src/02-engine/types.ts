/**
 * 对话引擎类型 (Query Engine Types)
 * ============================================================================
 * 设计思想：
 * QueryEngine 是 Claude Code 的"心脏"。它 owning 整个对话生命周期：
 * - 维护 messages 历史
 * - 调用模型 API
 * - 解析 tool_use 并调度工具执行
 * - 管理 token budget、上下文压缩、错误恢复
 *
 * 在简化版中，我们用 simulateLLMResponse 替代真实 API 调用，但保留完整的
 * 状态流转结构：user message → assistant message → [tool calls] → [tool results]
 * → follow-up loop
 * ============================================================================
 */

export type Role = 'user' | 'assistant' | 'system' | 'tool';

export interface EngineMessage {
  role: Role;
  content: string;
  timestamp: number;
  toolUseId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  output: string;
  isError?: boolean;
}

export interface QueryResponse {
  message: EngineMessage;
  toolCalls?: ToolCall[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
}

export interface EngineConfig {
  /** 最大对话轮数，防止无限 tool loop */
  maxTurns: number;
  /** 单次模型调用超时 */
  timeout: number;
}
