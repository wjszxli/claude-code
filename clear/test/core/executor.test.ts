/**
 * Executor Tests
 * 验证工具执行管线: validate → permission → execute → state update
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  executeToolCall,
  executeToolCalls,
  createExecutionContext,
} from '../../core/executor.js'
import { buildTool } from '../../core/tool.js'
import { z } from 'zod/v4'

// 测试工具
const EchoTool = buildTool({
  name: 'echo',
  maxResultSizeChars: 1000,
  inputSchema: z.object({ message: z.string() }),
  call: async (input) => ({ data: input.message }),
  description: async (input) => `Echo: ${input.message}`,
  prompt: async () => 'Echo tool',
  isConcurrencySafe: () => true,
})

const ValidatedTool = buildTool({
  name: 'validated',
  maxResultSizeChars: 100,
  inputSchema: z.object({ value: z.number() }),
  call: async (input) => ({ data: input.value * 2 }),
  description: async () => 'Validated tool',
  prompt: async () => 'Validated',
  validateInput: async (input) => {
    if (input.value < 0) {
      return { result: false as const, message: 'value must be non-negative' }
    }
    return { result: true as const }
  },
})

describe('core/executor', () => {
  let ctx: ReturnType<typeof createExecutionContext>

  beforeEach(() => {
    ctx = createExecutionContext([EchoTool, ValidatedTool])
  })

  describe('executeToolCall', () => {
    it('executes a registered tool', async () => {
      const result = await executeToolCall('echo', { message: 'hello' }, ctx)
      expect(result.success).toBe(true)
      expect(result.result?.data).toBe('hello')
    })

    it('returns error for unknown tool', async () => {
      const result = await executeToolCall('nonexistent', {}, ctx)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Tool not found')
    })

    it('runs validateInput before execution', async () => {
      const result = await executeToolCall('validated', { value: -1 }, ctx)
      expect(result.success).toBe(false)
      expect(result.error).toContain('non-negative')
    })

    it('passes validation with valid input', async () => {
      const result = await executeToolCall('validated', { value: 5 }, ctx)
      expect(result.success).toBe(true)
      expect(result.result?.data).toBe(10)
    })

    it('denies execution when permission denies', async () => {
      ctx.permissionContext = {
        mode: 'default',
        alwaysDenyRules: [{ source: 'userSettings' as const, behavior: 'deny' as const, toolName: 'echo' }],
        alwaysAllowRules: [],
        alwaysAskRules: [],
      }
      const result = await executeToolCall('echo', { message: 'test' }, ctx)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Blocked')
    })

    it('updates state after successful execution', async () => {
      await executeToolCall('echo', { message: 'hello' }, ctx)
      const state = ctx.store.getState()
      const toolResults = state.messages.filter(m => (m as any).role === 'tool_result')
      expect(toolResults).toHaveLength(1)
    })
  })

  describe('executeToolCalls', () => {
    it('executes multiple safe tools in parallel', async () => {
      const result = await executeToolCalls(
        [
          { name: 'echo', input: { message: 'first' } },
          { name: 'echo', input: { message: 'second' } },
        ],
        ctx,
      )
      expect(result.allSucceeded).toBe(true)
      expect(result.results).toHaveLength(2)
    })

    it('reports partial failure', async () => {
      const result = await executeToolCalls(
        [
          { name: 'echo', input: { message: 'ok' } },
          { name: 'nonexistent', input: {} },
        ],
        ctx,
      )
      expect(result.allSucceeded).toBe(false)
      expect(result.results).toHaveLength(2)
    })

    it('tracks duration', async () => {
      const result = await executeToolCalls(
        [{ name: 'echo', input: { message: 'test' } }],
        ctx,
      )
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })
  })
})
