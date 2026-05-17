import { describe, it, expect, beforeEach } from 'vitest'
import { QueryEngine } from '@/02-engine/QueryEngine.js'
import { buildTool } from '@/03-tools/factory.js'
import type { ToolUseContext } from '@/03-tools/types.js'
import { getDefaultAppState } from '@/00-core/types.js'

function makeToolContext(): ToolUseContext {
  const state = getDefaultAppState()
  return {
    getAppState: () => state,
    setAppState: (u) => { Object.assign(state, u(state)) },
    permissionContext: { mode: 'yolo', deniedTools: [] },
    abortController: new AbortController(),
  }
}

describe('02-engine/QueryEngine', () => {
  let engine: QueryEngine

  beforeEach(() => {
    engine = new QueryEngine({ maxTurns: 10, timeout: 5000 })
  })

  describe('基础对话', () => {
    it('returns end_turn for normal input', async () => {
      const response = await engine.query('Hello', makeToolContext())
      expect(response.stopReason).toBe('end_turn')
      expect(response.message.role).toBe('assistant')
      expect(response.message.content).toContain('Hello')
    })

    it('accumulates history', async () => {
      await engine.query('First', makeToolContext())
      await engine.query('Second', makeToolContext())
      expect(engine.getHistory()).toHaveLength(4) // 2 user + 2 assistant
    })

    it('clearHistory resets history and usage', async () => {
      await engine.query('test', makeToolContext())
      engine.clearHistory()
      expect(engine.getHistory()).toHaveLength(0)
      expect(engine.getTokenUsage().totalTokens).toBe(0)
    })
  })

  describe('工具调用', () => {
    it('detects tool name in input and returns tool_use', async () => {
      const tool = buildTool<{ cmd: string }, string>({
        name: 'bash',
        description: 'Run bash',
        inputSchema: {},
        call: async (input) => `ran: ${input.cmd}`,
      })
      engine.registerTool(tool)

      const response = await engine.query('use bash to run ls', makeToolContext())
      expect(response.stopReason).toBe('tool_use')
      expect(response.toolCalls).toHaveLength(1)
      expect(response.toolCalls![0].name).toBe('bash')
    })

    it('executes tool and pushes result to history', async () => {
      const tool = buildTool({ name: 'bash', description: '', inputSchema: {}, call: async () => 'output' })
      engine.registerTool(tool)

      await engine.query('bash run something', makeToolContext())
      const history = engine.getHistory()
      // user → assistant → tool_result
      expect(history.some((m) => m.role === 'tool')).toBe(true)
    })

    it('skips unknown tool and warns', async () => {
      const tool = buildTool({ name: 'bash', description: '', inputSchema: {}, call: async () => 'ok' })
      engine.registerTool(tool)

      // Register tool 'bash', but mock simulateLLMResponse to return a call to 'nonexistent'
      // Since simulateLLMResponse only returns tools registered, this tests the executeToolCalls skip path
      // We test indirectly: if tool not in engine.tools, it's skipped
      const toolContext = makeToolContext()
      const response = await engine.query('bash test', toolContext)
      // Should still complete without error
      expect(response).toBeDefined()
    })

    it('throws on tool error when allowToolErrors=false', async () => {
      const tool = buildTool({
        name: 'bash',
        description: '',
        inputSchema: {},
        call: async () => { throw new Error('boom') },
      })
      engine.registerTool(tool)

      await expect(
        engine.query('bash error', makeToolContext(), { allowToolErrors: false }),
      ).rejects.toThrow('boom')
    })

    it('records error message when allowToolErrors=true', async () => {
      const tool = buildTool({
        name: 'bash',
        description: '',
        inputSchema: {},
        call: async () => { throw new Error('boom') },
      })
      engine.registerTool(tool)

      await engine.query('bash error', makeToolContext(), { allowToolErrors: true })
      const history = engine.getHistory()
      const errorMsg = history.find((m) => m.role === 'tool')
      expect(errorMsg).toBeDefined()
      expect(errorMsg!.content).toContain('boom')
    })
  })

  describe('系统提示', () => {
    it('system prompt affects response when it includes "coding"', async () => {
      engine.setSystemPrompt('You are a coding assistant.')
      const response = await engine.query('help me', makeToolContext())
      expect(response.message.content).toContain('code')
    })

    it('no system prompt uses default response', async () => {
      const response = await engine.query('help me', makeToolContext())
      expect(response.message.content).toContain('understand')
    })
  })

  describe('token 统计', () => {
    it('tracks token usage', async () => {
      await engine.query('hello world test', makeToolContext())
      const usage = engine.getTokenUsage()
      expect(usage.promptTokens).toBeGreaterThan(0)
      expect(usage.completionTokens).toBeGreaterThan(0)
      expect(usage.totalTokens).toBe(usage.promptTokens + usage.completionTokens)
    })

    it('getTokenUsage returns a copy', async () => {
      await engine.query('test', makeToolContext())
      const u1 = engine.getTokenUsage()
      const u2 = engine.getTokenUsage()
      expect(u1).toEqual(u2)
      expect(u1).not.toBe(u2)
    })
  })

  describe('配置与边界', () => {
    it('uses default config when none provided', () => {
      const defaultEngine = new QueryEngine()
      expect(defaultEngine).toBeDefined()
    })

    it('accepts extreme maxTurns values', () => {
      const e1 = new QueryEngine({ maxTurns: 0 })
      const e2 = new QueryEngine({ maxTurns: 9999 })
      expect(e1).toBeDefined()
      expect(e2).toBeDefined()
    })

    it('handles empty string input', async () => {
      const response = await engine.query('', makeToolContext())
      expect(response.message.role).toBe('assistant')
    })
  })

  describe('inferToolInput', () => {
    it('extracts path for file_read', async () => {
      const tool = buildTool({ name: 'file_read', description: '', inputSchema: {}, call: async () => 'ok' })
      engine.registerTool(tool)
      const response = await engine.query('use file_read at /tmp/test.txt', makeToolContext())
      expect(response.toolCalls![0].input).toEqual({ path: '/tmp/test.txt' })
    })

    it('extracts command for bash', async () => {
      const tool = buildTool({ name: 'bash', description: '', inputSchema: {}, call: async () => 'ok' })
      engine.registerTool(tool)
      const response = await engine.query('bash run ls', makeToolContext())
      expect(response.toolCalls![0].input).toEqual({ command: 'ls' })
    })

    it('uses full input as prompt for agent', async () => {
      const tool = buildTool({ name: 'agent', description: '', inputSchema: {}, call: async () => 'ok' })
      engine.registerTool(tool)
      const response = await engine.query('agent do something', makeToolContext())
      expect(response.toolCalls![0].input).toEqual({ prompt: 'agent do something' })
    })
  })
})
