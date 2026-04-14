/**
 * 核心类型定义
 * 对应原项目：state/AppStateStore.ts, types/command.ts, Task.ts 等
 */

export type MessageSource = "user" | "assistant" | "system" | "tool" | "task";

export interface Message {
  id: string;
  source: MessageSource;
  content: string;
  timestamp: number;
  toolUseId?: string;
  taskId?: string;
}

export type TaskStatus = "running" | "completed" | "failed" | "killed";
export type TaskType = "local_bash" | "local_agent" | "remote_agent";

export interface TaskState {
  id: string;
  type: TaskType;
  status: TaskStatus;
  description: string;
  startTime: number;
  endTime?: number;
  output: string[];
  notified: boolean;
  toolUseId?: string;
}

export type PermissionMode = "default" | "auto" | "plan" | "yolo";

export interface ToolPermissionContext {
  mode: PermissionMode;
  deniedTools: string[];
}

export interface AppState {
  messages: Message[];
  tasks: Record<string, TaskState>;
  permissionContext: ToolPermissionContext;
  model: string;
  verbose: boolean;
}

export function getDefaultAppState(): AppState {
  return {
    messages: [],
    tasks: {},
    permissionContext: {
      mode: "default",
      deniedTools: [],
    },
    model: "claude-3-5-sonnet",
    verbose: false,
  };
}
