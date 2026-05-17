/**
 * Bridge —— 远程桥接协议实现
 * ============================================================================
 * 设计思想：
 * Bridge 是 Claude Code 的"边缘计算"模式。当用户通过 Claude.ai 网页端
 * 发起请求时，本地 CLI 作为 worker 接收任务并执行代码操作。
 *
 * 这要求 Bridge 具备以下能力：
 * 1. 会话隔离：每个远程用户有独立的 session，避免文件系统冲突。
 * 2. 心跳与状态同步：通过消息总线将本地活动(tool_start/result/error)
 *    实时回传给云端。
 * 3. 资源上限：maxSessions 限制并发数，防止本地资源耗尽。
 * ============================================================================
 */

import type { BridgeConfig, BridgeMessage, Session, SessionActivity, SessionStatus } from './types.js';

export type MessageHandler = (message: BridgeMessage) => void;

export interface Bridge {
  getId(): string;
  getSessionCount(): number;
  startSession(name: string): string;
  endSession(sessionId: string, status: SessionStatus): void;
  getSession(sessionId: string): Session | undefined;
  recordActivity(sessionId: string, activity: SessionActivity): void;
  getActiveSessions(): Session[];
  onMessage(handler: MessageHandler): void;
  shutdown(): void;
}

export function createBridge(config: BridgeConfig): Bridge {
  const sessions = new Map<string, Session>();
  const messageHandlers = new Set<MessageHandler>();

  const sendMessage = (msg: BridgeMessage) => {
    messageHandlers.forEach((handler) => handler(msg));
  };

  return {
    getId: () => config.id,

    getSessionCount: () => sessions.size,

    startSession: (name: string): string => {
      if (sessions.size >= config.maxSessions) {
        throw new Error('max sessions reached');
      }
      const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const session: Session = {
        id: sessionId,
        status: 'running',
        activities: [],
        startTime: Date.now(),
      };
      sessions.set(sessionId, session);
      sendMessage({ type: 'session_start', sessionId });
      return sessionId;
    },

    endSession: (sessionId: string, status: SessionStatus): void => {
      const session = sessions.get(sessionId);
      if (session) {
        session.status = status;
        session.endTime = Date.now();
        sendMessage({ type: 'session_end', sessionId, status });
      }
    },

    getSession: (sessionId: string) => sessions.get(sessionId),

    recordActivity: (sessionId: string, activity: SessionActivity): void => {
      const session = sessions.get(sessionId);
      if (session && session.status === 'running') {
        session.activities.push(activity);
        sendMessage({ type: 'activity', sessionId, activity });
      }
    },

    getActiveSessions: () => Array.from(sessions.values()).filter((s) => s.status === 'running'),

    onMessage: (handler: MessageHandler) => {
      messageHandlers.add(handler);
    },

    shutdown: () => {
      sessions.forEach((session) => {
        if (session.status === 'running') {
          session.status = 'interrupted';
          session.endTime = Date.now();
          sendMessage({ type: 'session_end', sessionId: session.id, status: 'interrupted' });
        }
      });
      sessions.clear();
    },
  };
}
