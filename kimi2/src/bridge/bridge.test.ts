/**
 * Bridge 测试
 * 对应原项目：bridge/ 目录下的测试
 */

import { describe, it, expect } from 'vitest'
import { createBridge } from './bridge.js'
import type { BridgeConfig, SessionActivity } from './types.js'

describe('Bridge', () => {
  const config: BridgeConfig = {
    id: 'test-bridge-1',
    maxSessions: 5,
    dir: '/tmp/bridge',
  }

  it('should create a bridge with config', () => {
    const bridge = createBridge(config)
    expect(bridge.getId()).toBe(config.id)
    expect(bridge.getSessionCount()).toBe(0)
  })

  it('should start a session', () => {
    const bridge = createBridge(config)
    const sessionId = bridge.startSession('test-session')
    expect(sessionId).toBeDefined()
    expect(bridge.getSessionCount()).toBe(1)
  })

  it('should not exceed max sessions', () => {
    const bridge = createBridge({ ...config, maxSessions: 2 })
    bridge.startSession('session-1')
    bridge.startSession('session-2')
    expect(() => bridge.startSession('session-3')).toThrow('max sessions reached')
  })

  it('should end a session', () => {
    const bridge = createBridge(config)
    const sessionId = bridge.startSession('test-session')
    bridge.endSession(sessionId, 'completed')
    const session = bridge.getSession(sessionId)
    expect(session?.status).toBe('completed')
    expect(session?.endTime).toBeDefined()
  })

  it('should record session activity', () => {
    const bridge = createBridge(config)
    const sessionId = bridge.startSession('test-session')
    
    const activity: SessionActivity = {
      type: 'tool_start',
      summary: 'Editing file.ts',
      timestamp: Date.now(),
    }
    
    bridge.recordActivity(sessionId, activity)
    const session = bridge.getSession(sessionId)
    expect(session?.activities).toHaveLength(1)
    expect(session?.activities[0]).toEqual(activity)
  })

  it('should list active sessions', () => {
    const bridge = createBridge(config)
    bridge.startSession('session-1')
    bridge.startSession('session-2')
    const activeSessions = bridge.getActiveSessions()
    expect(activeSessions).toHaveLength(2)
  })

  it('should send and receive messages', () => {
    const bridge = createBridge(config)
    const messages: any[] = []
    
    bridge.onMessage((msg) => messages.push(msg))
    
    const sessionId = bridge.startSession('test-session')
    expect(messages).toHaveLength(1)
    expect(messages[0]).toEqual({ type: 'session_start', sessionId })
  })
})
