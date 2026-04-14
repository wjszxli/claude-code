/**
 * Bridge 类型定义
 * 对应原项目：bridge/types.ts
 */

export type SessionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'interrupted'

export type SessionActivity = {
  type: 'tool_start' | 'text' | 'result' | 'error'
  summary: string
  timestamp: number
}

export type BridgeConfig = {
  id: string
  maxSessions: number
  dir: string
}

export type Session = {
  id: string
  status: SessionStatus
  activities: SessionActivity[]
  startTime: number
  endTime?: number
}

export type BridgeMessage = 
  | { type: 'session_start'; sessionId: string }
  | { type: 'session_end'; sessionId: string; status: SessionStatus }
  | { type: 'activity'; sessionId: string; activity: SessionActivity }
