import { describe, it, expect } from 'vitest'
import { getDefaultAppState } from '@/00-core/types.js'

describe('00-core/types', () => {
  describe('getDefaultAppState', () => {
    it('returns correct default shape', () => {
      const state = getDefaultAppState()
      expect(state).toEqual({
        messages: [],
        tasks: {},
        permissionContext: { mode: 'default', deniedTools: [] },
        model: 'claude-3-5-sonnet',
        verbose: false,
      })
    })

    it('returns a new object each call (no shared reference)', () => {
      const a = getDefaultAppState()
      const b = getDefaultAppState()
      expect(a).not.toBe(b)
      expect(a).toEqual(b)
    })

    it('messages is always empty array', () => {
      const state = getDefaultAppState()
      expect(state.messages).toEqual([])
      expect(Array.isArray(state.messages)).toBe(true)
    })

    it('tasks is always empty object', () => {
      const state = getDefaultAppState()
      expect(state.tasks).toEqual({})
      expect(Object.keys(state.tasks)).toHaveLength(0)
    })

    it('permissionContext has default mode with no denied tools', () => {
      const state = getDefaultAppState()
      expect(state.permissionContext.mode).toBe('default')
      expect(state.permissionContext.deniedTools).toEqual([])
    })
  })
})
