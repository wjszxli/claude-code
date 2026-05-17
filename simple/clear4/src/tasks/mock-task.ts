/**
 * Mock task for testing
 */

import type { Task, TaskContext, TaskState, TaskStatus, TaskType } from './types.js'

type MockTaskConfig = {
  type: TaskType
  description?: string
  shouldRunLong?: boolean
}

export function createMockTask(config: MockTaskConfig): Task {
  const id = `task-${Date.now()}-${Math.random().toString(36).slice(2)}`
  let status: TaskStatus = 'pending'
  let output = ''
  let shouldStop = false

  return {
    id,
    type: config.type,
    get status() {
      return status
    },

    async start(context: TaskContext): Promise<void> {
      status = 'running'
      context.onProgress('Task started')

      if (config.shouldRunLong) {
        // Simulate long-running task
        for (let i = 0; i < 10; i++) {
          if (shouldStop || context.signal?.aborted) {
            status = 'killed'
            output = 'Task was killed'
            return
          }
          context.onProgress(`Working ${i + 1}/10`)
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
      } else {
        // Quick task
        await new Promise((resolve) => setTimeout(resolve, 10))
      }

      status = 'completed'
      output = 'Task completed successfully'
    },

    async kill(): Promise<void> {
      shouldStop = true
      if (status === 'running') {
        status = 'killed'
        output = 'Task was killed'
      }
    },

    getState(): TaskState {
      return {
        id,
        type: config.type,
        status,
        description: config.description || 'Mock task',
        startTime: Date.now(),
        output,
      }
    },
  }
}
