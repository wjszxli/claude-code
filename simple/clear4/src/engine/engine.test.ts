/**
 * Query Engine 测试
 * 对应原项目：QueryEngine 相关测试
 */

import { describe, it, expect } from 'vitest'
import { QueryEngine } from './engine.js'
import type { Tool, ToolDef } from '../tools/types.js'
import { buildTool } from '../tools/index.js'

describe('QueryEngine', () => {
  const createMockTool = (name: string, result: string): Tool<any, any> => {
    const def: ToolDef<any, any> = {
      name,
      description: `Mock ${name} tool`,
      parameters: {},
      call: async () => ({ result }),
    }
    return buildTool(def)
  }

  it('should create an engine', () => {
    const engine = new QueryEngine()
    expect(engine).toBeDefined()
  })

  it('should process a simple message', async () => {
    const engine = new QueryEngine()
    
    const response = await engine.query('Hello')
    
    expect(response.message).toBeDefined()
    expect(response.message.role).toBe('assistant')
    expect(response.message.content).toBeTruthy()
  })

  it('should execute tool calls', async () => {
    const engine = new QueryEngine()
    const echoTool = createMockTool('echo', 'echo result')
    
    engine.registerTool(echoTool)
    
    // Simulate a query that triggers tool use
    const response = await engine.query('Use the echo tool')
    
    expect(response.toolCalls).toBeDefined()
    expect(response.toolCalls).toHaveLength(1)
    expect(response.toolCalls![0].name).toBe('echo')
  })

  it('should handle multi-turn conversations', async () => {
    const engine = new QueryEngine()
    
    await engine.query('First message')
    await engine.query('Second message')
    
    const history = engine.getHistory()
    expect(history.length).toBeGreaterThan(2)
  })

  it('should respect max turns limit', async () => {
    const engine = new QueryEngine({ maxTurns: 2, timeout: 5000 })
    
    const longInput = 'Process this step by step with many turns'
    const response = await engine.query(longInput)
    
    const history = engine.getHistory()
    expect(history.length).toBeLessThanOrEqual(4) // 2 user + 2 assistant
  })

  it('should handle errors gracefully', async () => {
    const engine = new QueryEngine()
    
    const errorTool = createMockTool('error_tool', 'error')
    errorTool.call = async () => {
      throw new Error('Tool error')
    }
    
    engine.registerTool(errorTool)
    
    const response = await engine.query('Use error tool', {
      allowToolErrors: true,
    })
    
    expect(response.message).toBeDefined()
  })

  it('should clear history', async () => {
    const engine = new QueryEngine()
    
    await engine.query('Message 1')
    await engine.query('Message 2')
    
    engine.clearHistory()
    
    expect(engine.getHistory()).toHaveLength(0)
  })

  it('should support system prompts', async () => {
    const engine = new QueryEngine()
    
    engine.setSystemPrompt('You are a helpful coding assistant')
    
    const response = await engine.query('Hello')
    
    expect(response.message.content).toContain('code')
  })

  it('should track token usage', async () => {
    const engine = new QueryEngine()
    
    await engine.query('Test message')
    
    const usage = engine.getTokenUsage()
    expect(usage.totalTokens).toBeGreaterThan(0)
  })
})
