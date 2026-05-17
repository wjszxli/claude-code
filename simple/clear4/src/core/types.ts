export type MessageSource = "user" | "assistant" | "system" | "tool" | "task";

export interface Message {
  id: string;
  source: MessageSource;
  content: string;
  timestamp: number;
  toolUseId?: string;
  taskId?: string;
}

export type PermissionMode = "default" | "auto" | "plan" | "yolo";

export interface ToolPermissionContext {
  mode: PermissionMode;
  deniedTools: string[];
}
