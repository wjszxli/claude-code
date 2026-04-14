/**
 * State Management Tests
 * 验证不可变状态更新、选择器、订阅
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  createStateStore,
  createDefaultAppState,
  selectors,
  updaters,
} from '../../core/state.js'
import type { TaskState } from '../../core/types.js'

describe('core/state', () => {
  let store: ReturnType<typeof createStateStore>

  beforeEach(() => {
    store = createStateStore()
  })

  describe('createDefaultAppState', () => {
    it('has empty messages', () => {
      const state = createDefaultAppState()
      expect(state.messages).toEqual([])
    })

    it('has default model', () => {
      const state = createDefaultAppState()
      expect(state.settings.model).toBe('claude-sonnet-4-20250514')
    })

    it('has default permission mode', () => {
      const state = createDefaultAppState()
      expect(state.settings.permissionMode).toBe('default')
    })
  })

  describe('StateStore', () => {
    it('getState returns initial state', () => {
      const state = store.getState()
      expect(state.messages).toEqual([])
    })

    it('setState applies updater immutably', () => {
      const before = store.getState()
      store.setState(s => ({
        ...s,
        messages: [{ role: 'user' as const, content: 'hello', timestamp: Date.now() }],
      }))
      const after = store.getState()

      expect(after.messages).toHaveLength(1)
      expect(before.messages).toHaveLength(0) // 旧引用不变
    })

    it('subscribe notifies on state change', () => {
      let notified = 0
      store.subscribe(() => notified++)

      store.setState(s => ({ ...s, settings: { ...s.settings, model: 'opus' } }))
      expect(notified).toBe(1)
    })

    it('subscribe returns unsubscribe function', () => {
      let notified = 0
      const unsub = store.subscribe(() => notified++)

      unsub()
      store.setState(s => ({ ...s, settings: { ...s.settings, model: 'opus' } }))
      expect(notified).toBe(0)
    })

    it('reset restores default state', () => {
      store.setState(s => ({
        ...s,
        messages: [{ role: 'user' as const, content: 'test', timestamp: Date.now() }],
      }))
      expect(store.getState().messages).toHaveLength(1)

      store.reset()
      expect(store.getState().messages).toHaveLength(0)
    })
  })

  describe('selectors', () => {
    it('getMessages returns messages', () => {
      const state = createDefaultAppState()
      expect(selectors.getMessages(state)).toEqual([])
    })

    it('getModel returns current model', () => {
      const state = createDefaultAppState()
      expect(selectors.getModel(state)).toBe('claude-sonnet-4-20250514')
    })

    it('getActiveTasks filters terminal tasks', () => {
      const state = {
        ...createDefaultAppState(),
        tasks: {
          't1': { id: 't1', type: 'local_bash' as const, status: 'running', description: '', startTime: 0 },
          't2': { id: 't2', type: 'local_bash' as const, status: 'completed', description: '', startTime: 0 },
          't3': { id: 't3', type: 'local_agent' as const, status: 'pending', description: '', startTime: 0 },
        },
      }
      const active = selectors.getActiveTasks(state)
      expect(active).toHaveLength(2)
      expect(active.every(t => t.status !== 'completed')).toBe(true)
    })

    it('isStreaming checks stream mode', () => {
      const state = createDefaultAppState()
      expect(selectors.isStreaming(state)).toBe(false)

      const streaming = { ...state, ui: { ...state.ui, streamMode: 'streaming' as const } }
      expect(selectors.isStreaming(streaming)).toBe(true)
    })
  })

  describe('updaters', () => {
    it('appendMessage adds a message', () => {
      const state = createDefaultAppState()
      const msg = { role: 'user' as const, content: 'hi', timestamp: Date.now() }
      const next = updaters.appendMessage(msg)(state)
      expect(next.messages).toHaveLength(1)
    })

    it('registerTask adds to tasks', () => {
      const state = createDefaultAppState()
      const task: TaskState = {
        id: 'b12345',
        type: 'local_bash',
        status: 'pending',
        description: 'test',
        startTime: Date.now(),
      }
      const next = updaters.registerTask(task)(state)
      expect(next.tasks['b12345']).toEqual(task)
    })

    it('updateTaskStatus changes status', () => {
      const state = {
        ...createDefaultAppState(),
        tasks: {
          'b1': { id: 'b1', type: 'local_bash' as const, status: 'pending', description: '', startTime: 0 },
        },
      }
      const next = updaters.updateTaskStatus('b1', 'running')(state)
      expect(next.tasks['b1'].status).toBe('running')
    })

    it('updateTaskStatus on missing task returns same state', () => {
      const state = createDefaultAppState()
      const next = updaters.updateTaskStatus('nonexistent', 'running')(state)
      expect(next).toBe(state)
    })

    it('removeTerminalTasks only keeps active', () => {
      const state = {
        ...createDefaultAppState(),
        tasks: {
          't1': { id: 't1', type: 'local_bash' as const, status: 'running', description: '', startTime: 0 },
          't2': { id: 't2', type: 'local_bash' as const, status: 'completed', description: '', startTime: 0, endTime: 0 },
          't3': { id: 't3', type: 'local_bash' as const, status: 'killed', description: '', startTime: 0, endTime: 0 },
        },
      }
      const next = updaters.removeTerminalTasks()(state)
      expect(Object.keys(next.tasks)).toEqual(['t1'])
    })

    it('setStreaming toggles stream mode', () => {
      const state = createDefaultAppState()
      const next = updaters.setStreaming(true)(state)
      expect(next.ui.streamMode).toBe('streaming')
    })
  })
})
