/**
 * 任务系统类型 (Task System Types)
 * ============================================================================
 * 设计思想：
 * 原项目的任务系统支持多种类型：LocalShellTask、LocalAgentTask、RemoteAgentTask、
 * InProcessTeammateTask、LocalWorkflowTask、DreamTask 等。
 *
 * 所有任务共享同一套 TaskState 联合类型，并通过 TaskManager 统一管理生命周期。
 * 这种"统一接口 + 多态实现"的设计让上层（如 QueryEngine、Bridge）能以一致方式
 * 与任何任务交互，而无需关心其内部是本地进程、远程代理还是工作流。
 * ============================================================================
 */

export type TaskType = 'local_bash' | 'local_agent' | 'remote_agent' | 'workflow';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'killed';

export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'killed';
}

export interface TaskState {
  id: string;
  type: TaskType;
  status: TaskStatus;
  description: string;
  startTime: number;
  endTime?: number;
  output?: string;
}

export interface TaskContext {
  signal?: AbortSignal;
  onProgress: (message: string) => void;
}

export interface Task {
  readonly id: string;
  readonly type: TaskType;
  readonly status: TaskStatus;
  start(context: TaskContext): Promise<void>;
  kill(): Promise<void>;
  getState(): TaskState;
}
