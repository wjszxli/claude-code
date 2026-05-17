/**
 * 核心类型层 (Core Types)
 * ============================================================================
 * 设计思想：
 * 1. 单一事实源 (Single Source of Truth) —— AppState 收敛所有跨模块状态。
 * 2. 不可变更新 (Immutable Updates) —— 所有状态变更都通过函数式更新生成新对象，
 *    配合订阅模式实现细粒度响应。
 * 3. 显式边界 (Explicit Boundaries) —— Message / Task / Permission 等基础概念
 *    在核心层定义，上层模块只依赖这些类型，避免循环依赖。
 * ============================================================================
 */

export type MessageSource = 'user' | 'assistant' | 'system' | 'tool' | 'task';

export interface Message {
  id: string;
  source: MessageSource;
  content: string;
  timestamp: number;
  toolUseId?: string;
  taskId?: string;
}

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'killed';
export type TaskType = 'local_bash' | 'local_agent' | 'remote_agent' | 'workflow';

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

export type PermissionMode = 'default' | 'auto' | 'plan' | 'yolo';

export interface ToolPermissionContext {
  mode: PermissionMode;
  deniedTools: string[];
}

/**
 * AppState 是整个应用的唯一全局状态树。
 * 原项目中对应 state/AppStateStore.ts，包含 messages、tasks、permissions 等所有会话状态。
 */
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
      mode: 'default',
      deniedTools: [],
    },
    model: 'claude-3-5-sonnet',
    verbose: false,
  };
}
