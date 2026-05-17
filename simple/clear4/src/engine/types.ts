/**
 * Engine 类型定义
 * 对应原项目：QueryEngine.ts, types/message.ts
 */

export type Role = 'user' | 'assistant' | 'system'

export type Message = {
  role: Role
  content: string
  timestamp: number
}

export type ToolCall = {
  id: string
  name: string
  input: Record<string, any>
}

export type ToolResult = {
  toolCallId: string
  output: string
  isError?: boolean
}

export type QueryResponse = {
  message: Message
  toolCalls?: ToolCall[]
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens'
}

export type EngineConfig = {
  maxTurns: number
  timeout: number
}
