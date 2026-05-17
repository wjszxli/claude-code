import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createBridge } from '@/05-bridge/Bridge.js'
import type { BridgeMessage } from '@/05-bridge/types.js'

describe('05-bridge/Bridge', () => {
  const config = { id: 'test-bridge', maxSessions: 3, dir: '/tmp' }

  beforeEach(() => {})

  it('returns correct bridge ID', () => {
    const bridge = createBridge(config)
    expect(bridge.getId()).toBe('test-bridge')
  })

  describe('startSession', () => {
    it('creates a running session', () => {
      const bridge = createBridge(config)
      const id = bridge.startSession('session-1')
      const session = bridge.getSession(id)
      expect(session).toBeDefined()
      expect(session!.status).toBe('running')
      expect(session!.activities).toEqual([])
    })

    it('throws when maxSessions reached', () => {
      const bridge = createBridge({ ...config, maxSessions: 2 })
      bridge.startSession('s1')
      bridge.startSession('s2')
      expect(() => bridge.startSession('s3')).toThrow('max sessions reached')
    })

    it('emits session_start message', () => {
      const bridge = createBridge(config)
      const handler = vi.fn()
      bridge.onMessage(handler)
      const id = bridge.startSession('s1')
      expect(handler).toHaveBeenCalledWith({ type: 'session_start', sessionId: id })
    })

    it('generates unique session IDs', () => {
      const bridge = createBridge(config)
      const id1 = bridge.startSession('s1')
      const id2 = bridge.startSession('s2')
      expect(id1).not.toBe(id2)
    })
  })

  describe('endSession', () => {
    it('sets session status and endTime', () => {
      const bridge = createBridge(config)
      const id = bridge.startSession('s1')
      bridge.endSession(id, 'completed')
      const session = bridge.getSession(id)
      expect(session!.status).toBe('completed')
      expect(session!.endTime).toBeDefined()
    })

    it('emits session_end message', () => {
      const bridge = createBridge(config)
      const handler = vi.fn()
      bridge.onMessage(handler)
      const id = bridge.startSession('s1')
      bridge.endSession(id, 'failed')
      expect(handler).toHaveBeenCalledWith({ type: 'session_end', sessionId: id, status: 'failed' })
    })

    it('no-op for unknown session', () => {
      const bridge = createBridge(config)
      const handler = vi.fn()
      bridge.onMessage(handler)
      bridge.endSession('nonexistent', 'completed')
      expect(handler).not.toHaveBeenCalled()
    })

    it('supports interrupted status', () => {
      const bridge = createBridge(config)
      const id = bridge.startSession('s1')
      bridge.endSession(id, 'interrupted')
      expect(bridge.getSession(id)!.status).toBe('interrupted')
    })
  })

  describe('recordActivity', () => {
    it('adds activity to session', () => {
      const bridge = createBridge(config)
      const id = bridge.startSession('s1')
      bridge.recordActivity(id, { type: 'text', summary: 'Hello', timestamp: Date.now() })
      bridge.recordActivity(id, { type: 'tool_start', summary: 'Bash', timestamp: Date.now() })
      expect(bridge.getSession(id)!.activities).toHaveLength(2)
    })

    it('emits activity message', () => {
      const bridge = createBridge(config)
      const handler = vi.fn()
      bridge.onMessage(handler)
      const id = bridge.startSession('s1')

      const activity = { type: 'result' as const, summary: 'output', timestamp: Date.now() }
      bridge.recordActivity(id, activity)
      expect(handler).toHaveBeenCalledWith({ type: 'activity', sessionId: id, activity })
    })

    it('no-op for unknown session', () => {
      const bridge = createBridge(config)
      const handler = vi.fn()
      bridge.onMessage(handler)
      bridge.recordActivity('nonexistent', { type: 'text', summary: 'x', timestamp: 0 })
      // Only session_start from previous calls; no activity for unknown session
      expect(handler).not.toHaveBeenCalled()
    })

    it('no-op for ended session', () => {
      const bridge = createBridge(config)
      const handler = vi.fn()
      bridge.onMessage(handler)
      const id = bridge.startSession('s1')
      bridge.endSession(id, 'completed')
      handler.mockClear()
      bridge.recordActivity(id, { type: 'text', summary: 'x', timestamp: 0 })
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('getActiveSessions', () => {
    it('returns only running sessions', () => {
      const bridge = createBridge(config)
      const id1 = bridge.startSession('s1')
      const id2 = bridge.startSession('s2')
      bridge.endSession(id1, 'completed')

      const active = bridge.getActiveSessions()
      expect(active).toHaveLength(1)
      expect(active[0].id).toBe(id2)
    })

    it('returns empty when no sessions', () => {
      const bridge = createBridge(config)
      expect(bridge.getActiveSessions()).toEqual([])
    })

    it('returns empty after all sessions ended', () => {
      const bridge = createBridge(config)
      const id = bridge.startSession('s1')
      bridge.endSession(id, 'completed')
      expect(bridge.getActiveSessions()).toEqual([])
    })
  })

  describe('getSessionCount', () => {
    it('tracks total sessions (including ended)', () => {
      const bridge = createBridge(config)
      const id = bridge.startSession('s1')
      bridge.endSession(id, 'completed')
      expect(bridge.getSessionCount()).toBe(1) // ended sessions still in map
    })
  })

  describe('shutdown', () => {
    it('interrupts all running sessions', () => {
      const bridge = createBridge(config)
      bridge.startSession('s1')
      bridge.startSession('s2')
      bridge.shutdown()
      expect(bridge.getActiveSessions()).toHaveLength(0)
      expect(bridge.getSessionCount()).toBe(0) // cleared
    })

    it('emits session_end for each running session', () => {
      const bridge = createBridge(config)
      const handler = vi.fn()
      bridge.onMessage(handler)
      const id1 = bridge.startSession('s1')
      bridge.startSession('s2')

      handler.mockClear()
      bridge.shutdown()
      // Should emit session_end for each running session
      const endCalls = handler.mock.calls.filter((c: [BridgeMessage]) => c[0].type === 'session_end')
      expect(endCalls).toHaveLength(2)
      expect(endCalls.every((c: [BridgeMessage]) => c[0].status === 'interrupted')).toBe(true)
    })

    it('clears all sessions', () => {
      const bridge = createBridge(config)
      bridge.startSession('s1')
      bridge.shutdown()
      expect(bridge.getSessionCount()).toBe(0)
    })
  })
})
