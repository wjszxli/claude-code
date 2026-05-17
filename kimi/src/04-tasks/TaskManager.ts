/**
 * TaskManager —— 任务生命周期管理
 * ============================================================================
 * 设计思想：
 * TaskManager 是后台任务的"调度中枢"。它的职责不是直接执行命令，而是：
 * 1. 维护任务注册表 (Map<string, Task>)
 * 2. 管理状态流转 (pending → running → completed/failed/killed)
 * 3. 广播事件，让 UI 层或 Bridge 层感知任务变化
 * 4. 资源回收 (cleanupCompletedTasks)
 *
 * 这与 QueryEngine 形成"前后台分离"：QueryEngine 负责前台对话循环，
 * TaskManager 负责后台长时间运行的任务（如大文件编译、远程代理会话）。
 * ============================================================================
 */

import type { Task, TaskState, TaskType } from './types.js';

export type TaskEventType = 'started' | 'completed' | 'failed' | 'killed';

export interface TaskEvent {
  type: TaskEventType;
  taskId: string;
  timestamp: number;
}

export type TaskEventHandler = (event: TaskEvent) => void;

export class TaskManager {
  private tasks = new Map<string, Task>();
  private handlers = new Set<TaskEventHandler>();

  addTask(task: Task): void {
    this.tasks.set(task.id, task);
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  async startTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    const abortController = new AbortController();
    this.emitEvent({ type: 'started', taskId, timestamp: Date.now() });

    try {
      await task.start({
        signal: abortController.signal,
        onProgress: () => {},
      });
      this.emitEvent({
        type: task.status === 'killed' ? 'killed' : 'completed',
        taskId,
        timestamp: Date.now(),
      });
    } catch {
      this.emitEvent({ type: 'failed', taskId, timestamp: Date.now() });
    }
  }

  async killTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;
    await task.kill();
    this.emitEvent({ type: 'killed', taskId, timestamp: Date.now() });
  }

  getTasksByType(type: TaskType): Task[] {
    return Array.from(this.tasks.values()).filter((task) => task.type === type);
  }

  cleanupCompletedTasks(): void {
    for (const [id, task] of this.tasks.entries()) {
      if (isTerminalTaskStatus(task.status)) {
        this.tasks.delete(id);
      }
    }
  }

  onTaskEvent(handler: TaskEventHandler): void {
    this.handlers.add(handler);
  }

  private emitEvent(event: TaskEvent): void {
    this.handlers.forEach((handler) => handler(event));
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  getActiveTasks(): Task[] {
    return Array.from(this.tasks.values()).filter((task) => task.status === 'running');
  }
}

function isTerminalTaskStatus(status: TaskStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'killed';
}
