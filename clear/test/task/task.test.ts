/**
 * Task System Tests
 * 验证任务生命周期: register → start → complete/fail/kill
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  generateTaskId,
  registerTask,
  startTask,
  completeTask,
  failTask,
  killTask,
  cleanupTasks,
  getActiveTasks,
  getTask,
  getTasksByType,
} from '../../task/task.js'
import { createStateStore } from '../../core/state.js'

describe('task/task', () => {
  let store: ReturnType<typeof createStateStore>

  beforeEach(() => {
    store = createStateStore()
  })

  describe('generateTaskId', () => {
    it('generates bash task ID with "b" prefix', () => {
      const id = generateTaskId('local_bash')
      expect(id).toMatch(/^b[a-z0-9]{8}$/)
    })

    it('generates agent task ID with "a" prefix', () => {
      const id = generateTaskId('local_agent')
      expect(id).toMatch(/^a[a-z0-9]{8}$/)
    })

    it('generates remote task ID with "r" prefix', () => {
      const id = generateTaskId('remote_agent')
      expect(id).toMatch(/^r[a-z0-9]{8}$/)
    })

    it('generates unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateTaskId('local_bash')))
      expect(ids.size).toBe(100)
    })
  })

  describe('lifecycle', () => {
    it('registers task in pending state', () => {
      const task = registerTask(
        { type: 'local_bash', description: 'echo hello' },
        store,
      )
      expect(task.status).toBe('pending')
      expect(task.type).toBe('local_bash')
      expect(getTask(task.id, store)).toBe(task)
    })

    it('transitions to running', () => {
      const task = registerTask({ type: 'local_bash', description: 'test' }, store)
      startTask(task.id, store)
      expect(getTask(task.id, store)?.status).toBe('running')
    })

    it('transitions to completed with endTime', () => {
      const task = registerTask({ type: 'local_bash', description: 'test' }, store)
      startTask(task.id, store)
      completeTask(task.id, store)
      const updated = getTask(task.id, store)
      expect(updated?.status).toBe('completed')
      expect(updated?.endTime).toBeDefined()
    })

    it('transitions to failed with endTime', () => {
      const task = registerTask({ type: 'local_bash', description: 'test' }, store)
      failTask(task.id, store)
      expect(getTask(task.id, store)?.status).toBe('failed')
      expect(getTask(task.id, store)?.endTime).toBeDefined()
    })

    it('transitions to killed', async () => {
      const task = registerTask({ type: 'local_agent', description: 'agent task' }, store)
      await killTask(task.id, store)
      expect(getTask(task.id, store)?.status).toBe('killed')
    })
  })

  describe('queries', () => {
    it('getActiveTasks returns non-terminal tasks', () => {
      const t1 = registerTask({ type: 'local_bash', description: 'a' }, store)
      const t2 = registerTask({ type: 'local_bash', description: 'b' }, store)
      completeTask(t1.id, store)

      const active = getActiveTasks(store)
      expect(active).toHaveLength(1)
      expect(active[0]!.id).toBe(t2.id)
    })

    it('getTasksByType filters by type', () => {
      registerTask({ type: 'local_bash', description: 'bash' }, store)
      registerTask({ type: 'local_agent', description: 'agent' }, store)
      registerTask({ type: 'local_bash', description: 'bash2' }, store)

      const bashTasks = getTasksByType('local_bash', store)
      expect(bashTasks).toHaveLength(2)
    })

    it('cleanupTasks removes terminal tasks', () => {
      const t1 = registerTask({ type: 'local_bash', description: 'a' }, store)
      const t2 = registerTask({ type: 'local_bash', description: 'b' }, store)
      completeTask(t1.id, store)

      cleanupTasks(store)
      expect(store.getState().tasks).toHaveProperty(t2.id)
      expect(store.getState().tasks).not.toHaveProperty(t1.id)
    })
  })
})
