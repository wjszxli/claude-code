/**
 * Agent System Tests
 * 验证代理定义、子代理上下文创建、工具过滤
 */

import { describe, it, expect } from 'vitest'
import {
  BUILT_IN_AGENTS,
  findAgentDefinition,
  getAllAgents,
  createSubagentContext,
} from '../../agent/agent.js'
import { buildTool } from '../../core/tool.js'
import { z } from 'zod/v4'

const ReadTool = buildTool({
  name: 'Read',
  maxResultSizeChars: 100,
  inputSchema: z.object({ file_path: z.string() }),
  call: async (input) => ({ data: input.file_path }),
  description: async () => 'Read',
  prompt: async () => 'Read',
})

const WriteTool = buildTool({
  name: 'Write',
  maxResultSizeChars: 100,
  inputSchema: z.object({ file_path: z.string(), content: z.string() }),
  call: async (input) => ({ data: input.file_path }),
  description: async () => 'Write',
  prompt: async () => 'Write',
})

const BashTool = buildTool({
  name: 'Bash',
  maxResultSizeChars: 100,
  inputSchema: z.object({ command: z.string() }),
  call: async (input) => ({ data: input.command }),
  description: async () => 'Bash',
  prompt: async () => 'Bash',
})

const mockToolContext: any = {
  abortController: new AbortController(),
  getAppState: () => ({ messages: [], tasks: {}, settings: { permissionMode: 'default', model: '' } }),
  setAppState: () => {},
  messages: [],
  debug: false,
}

describe('agent/agent', () => {
  describe('BUILT_IN_AGENTS', () => {
    it('has general-purpose agent', () => {
      expect(BUILT_IN_AGENTS.find(a => a.type === 'general-purpose')).toBeDefined()
    })

    it('has explore agent', () => {
      expect(BUILT_IN_AGENTS.find(a => a.type === 'explore')).toBeDefined()
    })

    it('has plan agent', () => {
      expect(BUILT_IN_AGENTS.find(a => a.type === 'plan')).toBeDefined()
    })
  })

  describe('findAgentDefinition', () => {
    it('finds built-in agent by type', () => {
      const agent = findAgentDefinition('explore')
      expect(agent.type).toBe('explore')
      expect(agent.model).toBe('sonnet')
    })

    it('finds custom agent', () => {
      const custom = [{ type: 'custom', displayName: 'Custom', description: '', prompt: '' }]
      const agent = findAgentDefinition('custom', custom)
      expect(agent.type).toBe('custom')
    })

    it('throws for unknown type', () => {
      expect(() => findAgentDefinition('nonexistent')).toThrow('Unknown agent type')
    })

    it('returns first agent when type is undefined', () => {
      const agent = findAgentDefinition(undefined)
      expect(agent).toBeDefined()
    })
  })

  describe('getAllAgents', () => {
    it('combines built-in and custom agents', () => {
      const custom = [{ type: 'custom', displayName: 'Custom', description: '', prompt: '' }]
      const all = getAllAgents(custom)
      expect(all.length).toBe(BUILT_IN_AGENTS.length + 1)
    })
  })

  describe('createSubagentContext', () => {
    it('filters tools by allowedTools', () => {
      const agentDef = {
        type: 'restricted',
        displayName: 'Restricted',
        description: '',
        prompt: '',
        allowedTools: ['Read'],
      }
      const ctx = createSubagentContext(mockToolContext, agentDef, [ReadTool, WriteTool, BashTool])
      expect(ctx.tools).toHaveLength(1)
      expect(ctx.tools[0]!.name).toBe('Read')
    })

    it('keeps all tools when no allowedTools', () => {
      const agentDef = {
        type: 'full',
        displayName: 'Full',
        description: '',
        prompt: '',
      }
      const ctx = createSubagentContext(mockToolContext, agentDef, [ReadTool, WriteTool, BashTool])
      expect(ctx.tools).toHaveLength(3)
    })

    it('degrades permission context to auto', () => {
      const agentDef = { type: 'test', displayName: 'Test', description: '', prompt: '' }
      const ctx = createSubagentContext(mockToolContext, agentDef, [ReadTool])
      expect(ctx.permissionContext.mode).toBe('auto')
    })

    it('has independent messages', () => {
      const agentDef = { type: 'test', displayName: 'Test', description: '', prompt: '' }
      const ctx = createSubagentContext(mockToolContext, agentDef, [ReadTool])
      expect(ctx.messages).toEqual([])
    })

    it('has independent abortController', () => {
      const agentDef = { type: 'test', displayName: 'Test', description: '', prompt: '' }
      const ctx = createSubagentContext(mockToolContext, agentDef, [ReadTool])
      expect(ctx.abortController).not.toBe(mockToolContext.abortController)
    })
  })
})
