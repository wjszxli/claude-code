/**
 * Bridge 实现 - 远程控制桥接协议简化版
 * 对应原项目：bridge/ 目录
 */

import type { BridgeConfig, BridgeMessage, Session, SessionActivity, SessionStatus } from './types.js'

export type MessageHandler = (message: BridgeMessage) => void

export interface Bridge {
  getId(): string
  getSessionCount(): number
  startSession(name: string): string
  endSession(sessionId: string, status: SessionStatus): void
  getSession(sessionId: string): Session | undefined
  recordActivity(sessionId: string, activity: SessionActivity): void
  getActiveSessions(): Session[]
  onMessage(handler: MessageHandler): void
  shutdown(): void
}

export function createBridge(config: BridgeConfig): Bridge {
  const sessions = new Map<string, Session>()
  const messageHandlers = new Set<MessageHandler>()

  const sendMessage = (msg: BridgeMessage) => {
    messageHandlers.forEach((handler) => handler(msg))
  }

  return {
    getId: () => config.id,

    getSessionCount: () => sessions.size,

    startSession: (name: string): string => {
      if (sessions.size >= config.maxSessions) {
        throw new Error('max sessions reached')
      }

      const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const session: Session = {
        id: sessionId,
        status: 'running',
        activities: [],
        startTime: Date.now(),
      }

      sessions.set(sessionId, session)
      sendMessage({ type: 'session_start', sessionId })
      return sessionId
    },

    endSession: (sessionId: string, status: SessionStatus): void => {
      const session = sessions.get(sessionId)
      if (session) {
        session.status = status
        session.endTime = Date.now()
        sendMessage({ type: 'session_end', sessionId, status })
      }
    },

    getSession: (sessionId: string) => sessions.get(sessionId),

    recordActivity: (sessionId: string, activity: SessionActivity): void => {
      const session = sessions.get(sessionId)
      if (session) {
        session.activities.push(activity)
        sendMessage({ type: 'activity', sessionId, activity })
      }
    },

    getActiveSessions: () => 
      Array.from(sessions.values()).filter((s) => s.status === 'running'),

    onMessage: (handler: MessageHandler) => {
      messageHandlers.add(handler)
    },

    shutdown: () => {
      sessions.forEach((session) => {
        if (session.status === 'running') {
          session.status = 'interrupted'
          session.endTime = Date.now()
        }
      })
      sessions.clear()
    },
  }
}
