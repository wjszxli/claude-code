/**
 * 状态管理 — 中心化不可变状态
 * 简化自 src/state/AppStateStore.ts (原文件 440+ 行)
 *
 * 核心设计:
 *   - 单一 AppState 对象包含所有应用状态
 *   - 通过 setAppState() 不可变更新
 *   - 通过 selectors 查询状态切片
 *   - DeepImmutable 包装确保运行时不可变
 *
 * 原项目使用 React Context + Store，
 * 这里简化为纯函数式 Store 以便独立测试。
 */

import type { PermissionContext, TaskState, Message, PermissionMode } from './types.js'

// ────────────────────────────────────────────
// AppState — 全局应用状态
// ────────────────────────────────────────────

/** 应用状态 — 唯一真相源 */
export type AppState = Readonly<{
  /** 核心配置 */
  settings: {
    model: string
    permissionMode: PermissionMode
    verbose: boolean
  }

  /** 对话消息列表 */
  messages: Message[]

  /** 工具列表 (运行时组装，含 MCP 工具) */
  tools: unknown[]

  /** 任务注册表 (taskId → TaskState) */
  tasks: Record<string, TaskState>

  /** MCP 连接状态 */
  mcp: {
    serverNames: string[]
    toolCount: number
    connected: boolean
  }

  /** UI 状态 */
  ui: {
    streamMode: 'idle' | 'streaming'
    expandedView: 'none' | 'tasks' | 'agents'
  }
}>

// ────────────────────────────────────────────
// Store — 状态容器
// ────────────────────────────────────────────

/** 创建默认状态 */
export function createDefaultAppState(): AppState {
  return {
    settings: {
      model: 'claude-sonnet-4-20250514',
      permissionMode: 'default',
      verbose: false,
    },
    messages: [],
    tools: [],
    tasks: {},
    mcp: {
      serverNames: [],
      toolCount: 0,
      connected: false,
    },
    ui: {
      streamMode: 'idle',
      expandedView: 'none',
    },
  }
}

/**
 * StateStore — 封装状态存取
 *
 * 设计决策:
 *   - 状态存储在闭包中 (不是全局变量)
 *   - 通过函数式更新保证不可变性
 *   - 订阅机制支持 UI 刷新 (React re-render)
 */
export type StateStore = {
  getState(): AppState
  setState(updater: (prev: AppState) => AppState): void
  subscribe(listener: () => void): () => void
  reset(): void
}

/** 创建状态 Store */
export function createStateStore(initial?: Partial<AppState>): StateStore {
  let state: AppState = { ...createDefaultAppState(), ...initial } as AppState
  const listeners = new Set<() => void>()

  return {
    getState: () => state,

    setState(updater) {
      const prev = state
      state = updater(prev)
      // 仅在状态实际变化时通知
      if (state !== prev) {
        listeners.forEach(fn => fn())
      }
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    reset() {
      state = createDefaultAppState()
      listeners.forEach(fn => fn())
    },
  }
}

// ────────────────────────────────────────────
// Selectors — 状态查询
// ────────────────────────────────────────────

/** 选择器 — 从 AppState 中提取特定切片 */
export const selectors = {
  /** 获取消息列表 */
  getMessages: (state: AppState) => state.messages,

  /** 获取当前模型 */
  getModel: (state: AppState) => state.settings.model,

  /** 获取权限模式 */
  getPermissionMode: (state: AppState) => state.settings.permissionMode,

  /** 获取活跃任务 (非终态) */
  getActiveTasks: (state: AppState) =>
    Object.values(state.tasks).filter(
      t => t.status !== 'completed' && t.status !== 'failed' && t.status !== 'killed'
    ),

  /** 获取指定任务 */
  getTaskById: (state: AppState, id: string) => state.tasks[id],

  /** 是否正在流式传输 */
  isStreaming: (state: AppState) => state.ui.streamMode === 'streaming',

  /** MCP 连接数 */
  getMcpServerCount: (state: AppState) => state.mcp.serverNames.length,

  /** 工具总数 */
  getToolCount: (state: AppState) =>
    state.tools.length + state.mcp.toolCount,
}

// ────────────────────────────────────────────
// State Updaters — 状态更新函数
// ────────────────────────────────────────────

/** 预定义的状态更新器 — 保证不可变更新 */
export const updaters = {
  /** 追加消息 */
  appendMessage: (message: Message) =>
    (state: AppState): AppState => ({
      ...state,
      messages: [...state.messages, message],
    }),

  /** 注册任务 */
  registerTask: (task: TaskState) =>
    (state: AppState): AppState => ({
      ...state,
      tasks: { ...state.tasks, [task.id]: task },
    }),

  /** 更新任务状态 */
  updateTaskStatus: (taskId: string, status: TaskState['status'], endTime?: number) =>
    (state: AppState): AppState => {
      const task = state.tasks[taskId]
      if (!task) return state
      return {
        ...state,
        tasks: {
          ...state.tasks,
          [taskId]: { ...task, status, endTime },
        },
      }
    },

  /** 移除终态任务 */
  removeTerminalTasks: () =>
    (state: AppState): AppState => {
      const active: Record<string, TaskState> = {}
      for (const [id, task] of Object.entries(state.tasks)) {
        if (task.status !== 'completed' && task.status !== 'failed' && task.status !== 'killed') {
          active[id] = task
        }
      }
      return { ...state, tasks: active }
    },

  /** 设置流式状态 */
  setStreaming: (streaming: boolean) =>
    (state: AppState): AppState => ({
      ...state,
      ui: { ...state.ui, streamMode: streaming ? 'streaming' : 'idle' },
    }),

  /** 设置模型 */
  setModel: (model: string) =>
    (state: AppState): AppState => ({
      ...state,
      settings: { ...state.settings, model },
    }),
}
