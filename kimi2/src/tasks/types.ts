/**
 * Task 类型定义
 * 对应原项目：Task.ts, tasks/types.ts
 */

export type TaskType = 'local_bash' | 'local_agent' | 'remote_agent' | 'workflow'

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'killed'

export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'killed'
}

export type TaskState = {
  id: string
  type: TaskType
  status: TaskStatus
  description: string
  startTime: number
  endTime?: number
  output?: string
}

export type TaskContext = {
  signal?: AbortSignal
  onProgress: (message: string) => void
}

export interface Task {
  readonly id: string
  readonly type: TaskType
  readonly status: TaskStatus
  start(context: TaskContext): Promise<void>
  kill(): Promise<void>
  getState(): TaskState
}
