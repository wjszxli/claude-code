/**
 * Task Manager 实现 - 任务生命周期管理简化版
 * 对应原项目：Task.ts, tasks/ 目录
 */

import type { Task, TaskState, TaskType } from './types.js'

export type TaskEventType = 'started' | 'completed' | 'failed' | 'killed'

export type TaskEvent = {
  type: TaskEventType
  taskId: string
  timestamp: number
}

export type TaskEventHandler = (event: TaskEvent) => void

export class TaskManager {
  private tasks = new Map<string, Task>()
  private handlers = new Set<TaskEventHandler>()

  getTaskCount(): number {
    return this.tasks.size
  }

  addTask(task: Task): void {
    this.tasks.set(task.id, task)
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId)
  }

  async startTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }

    const abortController = new AbortController()

    this.emitEvent({ type: 'started', taskId, timestamp: Date.now() })

    try {
      await task.start({
        signal: abortController.signal,
        onProgress: (message) => {
          // Could emit progress events here
        },
      })

      this.emitEvent({ 
        type: task.status === 'killed' ? 'killed' : 'completed', 
        taskId, 
        timestamp: Date.now() 
      })
    } catch (error) {
      this.emitEvent({ type: 'failed', taskId, timestamp: Date.now() })
      throw error
    }
  }

  async killTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) {
      return
    }

    await task.kill()
    this.emitEvent({ type: 'killed', taskId, timestamp: Date.now() })
  }

  getTasksByType(type: TaskType): Task[] {
    return Array.from(this.tasks.values()).filter((task) => task.type === type)
  }

  cleanupCompletedTasks(): void {
    for (const [id, task] of this.tasks.entries()) {
      const state = task.getState()
      if (state.status === 'completed' || state.status === 'failed' || state.status === 'killed') {
        this.tasks.delete(id)
      }
    }
  }

  onTaskEvent(handler: TaskEventHandler): void {
    this.handlers.add(handler)
  }

  private emitEvent(event: TaskEvent): void {
    this.handlers.forEach((handler) => handler(event))
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values())
  }

  getActiveTasks(): Task[] {
    return Array.from(this.tasks.values()).filter((task) => task.status === 'running')
  }
}
