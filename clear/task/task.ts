/**
 * Task 系统 — 异步任务管理
 * 简化自 src/Task.ts + src/tasks/ (原文件合计 500+ 行)
 *
 * 核心设计:
 *   - TaskType 区分不同类型的后台任务
 *   - TaskStatus 线性状态机: pending → running → completed/failed/killed
 *   - Task ID 编码类型前缀 (b=bash, a=agent, r=remote)
 *   - 任务通过 AppState 注册和追踪
 */

import { randomBytes } from 'crypto'
import type { TaskType, TaskStatus, TaskState } from '../core/types.js'
import { isTerminalStatus } from '../core/types.js'
import type { StateStore } from '../core/state.js'
import { updaters } from '../core/state.js'

// ────────────────────────────────────────────
// Task ID Generation
// ────────────────────────────────────────────

/** 类型前缀映射 */
const TASK_ID_PREFIXES: Record<TaskType, string> = {
  local_bash: 'b',
  local_agent: 'a',
  remote_agent: 'r',
  dream: 'd',
}

/** URL-safe 字母表 (36^8 ≈ 2.8 万亿组合) */
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

/**
 * 生成任务 ID
 * 格式: {type_prefix}{8_random_chars}
 * e.g. b3k9f2x1 (bash task), a7m2p4n8 (agent task)
 */
export function generateTaskId(type: TaskType): string {
  const prefix = TASK_ID_PREFIXES[type]
  const bytes = randomBytes(8)
  let id = prefix
  for (let i = 0; i < 8; i++) {
    id += ALPHABET[bytes[i]! % ALPHABET.length]
  }
  return id
}

// ────────────────────────────────────────────
// Task Lifecycle
// ────────────────────────────────────────────

/** 任务创建参数 */
export type TaskCreateParams = {
  type: TaskType
  description: string
}

/** 任务操作接口 — 对应源码中的 Task interface */
export type TaskHandle = {
  taskId: string
  kill(): Promise<void>
}

/**
 * 注册新任务到 AppState
 */
export function registerTask(
  params: TaskCreateParams,
  store: StateStore,
): TaskState {
  const id = generateTaskId(params.type)

  const taskState: TaskState = {
    id,
    type: params.type,
    status: 'pending',
    description: params.description,
    startTime: Date.now(),
  }

  store.setState(updaters.registerTask(taskState))
  return taskState
}

/**
 * 标记任务为运行中
 */
export function startTask(taskId: string, store: StateStore): void {
  store.setState(updaters.updateTaskStatus(taskId, 'running'))
}

/**
 * 标记任务完成
 */
export function completeTask(taskId: string, store: StateStore): void {
  store.setState(updaters.updateTaskStatus(taskId, 'completed', Date.now()))
}

/**
 * 标记任务失败
 */
export function failTask(taskId: string, store: StateStore): void {
  store.setState(updaters.updateTaskStatus(taskId, 'failed', Date.now()))
}

/**
 * 终止任务
 */
export async function killTask(taskId: string, store: StateStore): Promise<void> {
  store.setState(updaters.updateTaskStatus(taskId, 'killed', Date.now()))
}

/**
 * 清理所有终态任务
 */
export function cleanupTasks(store: StateStore): void {
  store.setState(updaters.removeTerminalTasks())
}

// ────────────────────────────────────────────
// Task Queries
// ────────────────────────────────────────────

/**
 * 获取所有活跃任务
 */
export function getActiveTasks(store: StateStore): TaskState[] {
  const state = store.getState()
  return Object.values(state.tasks).filter(t => !isTerminalStatus(t.status))
}

/**
 * 按 ID 获取任务
 */
export function getTask(taskId: string, store: StateStore): TaskState | undefined {
  return store.getState().tasks[taskId]
}

/**
 * 按类型获取任务
 */
export function getTasksByType(type: TaskType, store: StateStore): TaskState[] {
  const state = store.getState()
  return Object.values(state.tasks).filter(t => t.type === type)
}
