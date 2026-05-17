import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TaskManager } from '@/04-tasks/TaskManager.js'
import type { Task, TaskContext } from '@/04-tasks/types.js'

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: `task-${Math.random().toString(36).slice(2)}`,
    type: 'local_bash',
    status: 'pending',
    start: vi.fn(async (_ctx: TaskContext) => { /* default: succeed */ }),
    kill: vi.fn(async () => {}),
    getState: () => ({
      id: 'task-1',
      type: 'local_bash' as const,
      status: 'pending' as const,
      description: 'test task',
      startTime: Date.now(),
    }),
    ...overrides,
  }
}

describe('04-tasks/TaskManager', () => {
  let tm: TaskManager

  beforeEach(() => {
    tm = new TaskManager()
  })

  describe('addTask + getTask', () => {
    it('adds and retrieves a task', () => {
      const task = makeTask({ id: 't1' })
      tm.addTask(task)
      expect(tm.getTask('t1')).toBe(task)
    })

    it('returns undefined for unknown task', () => {
      expect(tm.getTask('nope')).toBeUndefined()
    })
  })

  describe('startTask', () => {
    it('emits started and completed events on success', async () => {
      const handler = vi.fn()
      tm.onTaskEvent(handler)

      const task = makeTask({ id: 't1' })
      tm.addTask(task)
      await tm.startTask('t1')

      expect(handler).toHaveBeenCalledTimes(2)
      expect(handler.mock.calls[0][0].type).toBe('started')
      expect(handler.mock.calls[1][0].type).toBe('completed')
    })

    it('emits started and failed events on error', async () => {
      const handler = vi.fn()
      tm.onTaskEvent(handler)

      const task = makeTask({
        id: 't2',
        start: async () => { throw new Error('fail') },
      })
      tm.addTask(task)
      await tm.startTask('t2')

      expect(handler).toHaveBeenCalledTimes(2)
      expect(handler.mock.calls[0][0].type).toBe('started')
      expect(handler.mock.calls[1][0].type).toBe('failed')
    })

    it('emits killed event when task status is killed', async () => {
      const handler = vi.fn()
      tm.onTaskEvent(handler)

      const task = makeTask({
        id: 't3',
        start: async () => { /* task gets killed during execution */ },
        get status() { return 'killed' as const },
      })
      tm.addTask(task)
      await tm.startTask('t3')

      // started + killed (not completed, because status === 'killed')
      expect(handler).toHaveBeenCalledTimes(2)
      expect(handler.mock.calls[1][0].type).toBe('killed')
    })

    it('throws for unknown task ID', async () => {
      await expect(tm.startTask('nonexistent')).rejects.toThrow('Task nonexistent not found')
    })
  })

  describe('killTask', () => {
    it('calls kill and emits killed event', async () => {
      const handler = vi.fn()
      tm.onTaskEvent(handler)
      const task = makeTask({ id: 't1' })
      tm.addTask(task)

      await tm.killTask('t1')
      expect(task.kill).toHaveBeenCalled()
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler.mock.calls[0][0].type).toBe('killed')
    })

    it('no-op for unknown task ID', async () => {
      // Should not throw
      await tm.killTask('nonexistent')
    })
  })

  describe('getTasksByType', () => {
    it('filters tasks by type', () => {
      tm.addTask(makeTask({ type: 'local_bash' }))
      tm.addTask(makeTask({ type: 'local_agent' }))
      tm.addTask(makeTask({ type: 'local_bash' }))

      expect(tm.getTasksByType('local_bash')).toHaveLength(2)
      expect(tm.getTasksByType('local_agent')).toHaveLength(1)
      expect(tm.getTasksByType('remote_agent')).toHaveLength(0)
    })
  })

  describe('getActiveTasks', () => {
    it('returns only running tasks', () => {
      tm.addTask(makeTask({ id: 'running', status: 'running' }))
      tm.addTask(makeTask({ id: 'completed', status: 'completed' }))
      tm.addTask(makeTask({ id: 'pending', status: 'pending' }))

      const active = tm.getActiveTasks()
      expect(active).toHaveLength(1)
      expect(active[0].id).toBe('running')
    })
  })

  describe('getAllTasks', () => {
    it('returns all tasks', () => {
      tm.addTask(makeTask({ id: 'a' }))
      tm.addTask(makeTask({ id: 'b' }))
      expect(tm.getAllTasks()).toHaveLength(2)
    })
  })

  describe('cleanupCompletedTasks', () => {
    it('removes completed/failed/killed tasks', () => {
      tm.addTask(makeTask({ id: 'pending', status: 'pending' }))
      tm.addTask(makeTask({ id: 'running', status: 'running' }))
      tm.addTask(makeTask({ id: 'completed', status: 'completed' }))
      tm.addTask(makeTask({ id: 'failed', status: 'failed' }))
      tm.addTask(makeTask({ id: 'killed', status: 'killed' }))

      tm.cleanupCompletedTasks()
      const remaining = tm.getAllTasks()
      expect(remaining).toHaveLength(2)
      expect(remaining.map((t) => t.id).sort()).toEqual(['pending', 'running'])
    })

    it('does nothing when no terminal tasks', () => {
      tm.addTask(makeTask({ id: 'a', status: 'running' }))
      tm.cleanupCompletedTasks()
      expect(tm.getAllTasks()).toHaveLength(1)
    })

    it('does nothing when task map is empty', () => {
      tm.cleanupCompletedTasks()
      expect(tm.getAllTasks()).toHaveLength(0)
    })
  })

  describe('事件系统', () => {
    it('event includes taskId and timestamp', async () => {
      const handler = vi.fn()
      tm.onTaskEvent(handler)

      const task = makeTask({ id: 'event-test' })
      tm.addTask(task)
      await tm.startTask('event-test')

      const event = handler.mock.calls[0][0]
      expect(event.taskId).toBe('event-test')
      expect(event.timestamp).toBeGreaterThan(0)
    })

    it('supports multiple event handlers', async () => {
      const h1 = vi.fn()
      const h2 = vi.fn()
      tm.onTaskEvent(h1)
      tm.onTaskEvent(h2)

      const task = makeTask({ id: 'multi' })
      tm.addTask(task)
      await tm.startTask('multi')

      expect(h1).toHaveBeenCalled()
      expect(h2).toHaveBeenCalled()
    })
  })
})
