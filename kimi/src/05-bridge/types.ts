/**
 * Bridge 类型定义
 * ============================================================================
 * 设计思想：
 * Bridge 模式让本地 CLI 成为云端 Claude 的"远程执行 Worker"。
 * 原项目中 bridgeMain.ts 通过轮询(poll)获取远程 work item，然后 spawn 子 CLI
 * 进程来执行会话，实现"本地计算、云端对话"的混合架构。
 *
 * Bridge 的核心抽象是 Session：每个远程用户对应一个本地 session，
 * 拥有独立的状态、任务列表和生命周期。
 * ============================================================================
 */

export type SessionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'interrupted';

export interface SessionActivity {
  type: 'tool_start' | 'text' | 'result' | 'error';
  summary: string;
  timestamp: number;
}

export interface BridgeConfig {
  id: string;
  maxSessions: number;
  dir: string;
}

export interface Session {
  id: string;
  status: SessionStatus;
  activities: SessionActivity[];
  startTime: number;
  endTime?: number;
}

export type BridgeMessage =
  | { type: 'session_start'; sessionId: string }
  | { type: 'session_end'; sessionId: string; status: SessionStatus }
  | { type: 'activity'; sessionId: string; activity: SessionActivity };
