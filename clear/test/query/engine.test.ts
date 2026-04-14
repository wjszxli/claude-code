/**
 * Query Engine Tests
 * 验证主循环: user → API → tool_use → result → loop
 */

import { describe, it, expect } from 'vitest'
import {
  runQuery,
  createMockAPIClient,
  compressMessages,
} from '../../query/engine.js'
import { buildTool } from '../../core/tool.js'
import { createExecutionContext } from '../../core/executor.js'
import { z } from 'zod/v4'

const EchoTool = buildTool({
  name: 'echo',
  maxResultSizeChars: 1000,
  inputSchema: z.object({ message: z.string() }),
  call: async (input) => ({ data: input.message }),
  description: async () => 'Echo',
  prompt: async () => 'Echo',
  isConcurrencySafe: () => true,
})

describe('query/engine', () => {
  describe('runQuery', () => {
    it('returns final message for end_turn response', async () => {
      const api = createMockAPIClient(() => [
        { type: 'text', text: 'Hello from Claude' },
      ])

      const execCtx = createExecutionContext([EchoTool])
      const result = await runQuery(
        {
          message: 'Hi',
          systemPrompt: 'You are helpful',
          tools: [EchoTool],
        },
        api,
        execCtx,
      )

      expect(result.message.content).toEqual([
        { type: 'text', text: 'Hello from Claude' },
      ])
      expect(result.turns).toBe(1)
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('loops on tool_use and returns final result', async () => {
      let callCount = 0
      const api = createMockAPIClient(() => {
        callCount++
        if (callCount === 1) {
          return [{ type: 'tool_use', id: 'tu_1', name: 'echo', input: { message: 'hello' } }]
        }
        return [{ type: 'text', text: 'Done' }]
      })

      const execCtx = createExecutionContext([EchoTool])
      const result = await runQuery(
        {
          message: 'Run echo',
          systemPrompt: '',
          tools: [EchoTool],
        },
        api,
        execCtx,
      )

      expect(result.turns).toBe(2)
      expect(result.message.content[0]).toEqual({ type: 'text', text: 'Done' })
    })

    it('respects maxTurns limit', async () => {
      const api = createMockAPIClient(() => [
        { type: 'tool_use', id: 'tu_1', name: 'echo', input: { message: 'loop' } },
      ])

      const execCtx = createExecutionContext([EchoTool])
      const result = await runQuery(
        {
          message: 'Loop',
          systemPrompt: '',
          tools: [EchoTool],
          maxTurns: 3,
        },
        api,
        execCtx,
      )

      expect(result.turns).toBeLessThanOrEqual(3)
    })

    it('accumulates usage across turns', async () => {
      let callCount = 0
      const api = createMockAPIClient(() => {
        callCount++
        if (callCount <= 2) {
          return [{ type: 'tool_use', id: `tu_${callCount}`, name: 'echo', input: { message: 'x' } }]
        }
        return [{ type: 'text', text: 'End' }]
      })

      const execCtx = createExecutionContext([EchoTool])
      const result = await runQuery(
        {
          message: 'Test',
          systemPrompt: '',
          tools: [EchoTool],
        },
        api,
        execCtx,
      )

      // 每轮 inputTokens=100, outputTokens=50
      expect(result.totalUsage.inputTokens).toBe(300)
      expect(result.totalUsage.outputTokens).toBe(150)
    })
  })

  describe('compressMessages', () => {
    it('does not compress when under limit', () => {
      const msgs = Array.from({ length: 10 }, (_, i) => ({
        role: 'user' as const,
        content: `msg ${i}`,
        timestamp: Date.now(),
      }))
      const result = compressMessages(msgs, 20)
      expect(result.wasCompressed).toBe(false)
      expect(result.messages).toHaveLength(10)
    })

    it('compresses when over limit', () => {
      const msgs = Array.from({ length: 30 }, (_, i) => ({
        role: 'user' as const,
        content: `msg ${i}`,
        timestamp: Date.now(),
      }))
      const result = compressMessages(msgs, 20)
      expect(result.wasCompressed).toBe(true)
      expect(result.messages.length).toBeLessThan(30)
    })

    it('preserves system messages during compression', () => {
      const msgs = [
        { role: 'system' as const, content: 'System prompt', timestamp: 0 },
        ...Array.from({ length: 25 }, (_, i) => ({
          role: 'user' as const,
          content: `msg ${i}`,
          timestamp: Date.now(),
        })),
      ]
      const result = compressMessages(msgs, 20)
      expect(result.messages[0]?.role).toBe('system')
    })
  })
})
