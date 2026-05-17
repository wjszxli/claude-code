/**
 * Permission System Tests
 * 验证三层权限检查、规则匹配、模式行为
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  checkPermission,
  createPermissionContext,
  ruleMatchesTool,
} from '../../core/permissions.js'
import { buildTool } from '../../core/tool.js'
import type { PermissionContext, PermissionRule } from '../../core/types.js'
import { z } from 'zod/v4'

// 测试工具
const ReadOnlyTool = buildTool({
  name: 'Read',
  maxResultSizeChars: 100,
  inputSchema: z.object({ file_path: z.string() }),
  call: async (input) => ({ data: input.file_path }),
  description: async () => 'Read file',
  prompt: async () => 'Read',
  isReadOnly: () => true,
})

const WriteTool = buildTool({
  name: 'Write',
  maxResultSizeChars: 100,
  inputSchema: z.object({ file_path: z.string(), content: z.string() }),
  call: async (input) => ({ data: input.file_path }),
  description: async () => 'Write file',
  prompt: async () => 'Write',
  isReadOnly: () => false,
})

const BashTool = buildTool({
  name: 'Bash',
  maxResultSizeChars: 100,
  inputSchema: z.object({ command: z.string() }),
  call: async (input) => ({ data: input.command }),
  description: async () => 'Run command',
  prompt: async () => 'Bash',
  isReadOnly: (input) => input.command.startsWith('ls'),
})

const mockToolContext: any = {
  abortController: new AbortController(),
  getAppState: () => ({ messages: [], tasks: {}, settings: { permissionMode: 'default', model: '' } }),
  setAppState: () => {},
  messages: [],
  debug: false,
}

describe('core/permissions', () => {
  describe('ruleMatchesTool', () => {
    it('matches exact tool name', () => {
      const rule: PermissionRule = { source: 'userSettings', behavior: 'allow', toolName: 'Read' }
      expect(ruleMatchesTool(rule, 'Read')).toBe(true)
    })

    it('does not match different tool name', () => {
      const rule: PermissionRule = { source: 'userSettings', behavior: 'allow', toolName: 'Read' }
      expect(ruleMatchesTool(rule, 'Write')).toBe(false)
    })

    it('matches prefix for MCP tools', () => {
      const rule: PermissionRule = { source: 'userSettings', behavior: 'deny', toolName: 'mcp__server' }
      expect(ruleMatchesTool(rule, 'mcp__server__tool1')).toBe(true)
    })

    it('matches with content rule for command', () => {
      const rule: PermissionRule = { source: 'userSettings', behavior: 'allow', toolName: 'Bash', ruleContent: 'git *' }
      expect(ruleMatchesTool(rule, 'Bash', { command: 'git status' })).toBe(true)
    })

    it('does not match when content rule fails', () => {
      const rule: PermissionRule = { source: 'userSettings', behavior: 'allow', toolName: 'Bash', ruleContent: 'git *' }
      expect(ruleMatchesTool(rule, 'Bash', { command: 'npm test' })).toBe(false)
    })
  })

  describe('checkPermission', () => {
    it('bypass mode always allows', async () => {
      const ctx = createPermissionContext('bypass')
      const result = await checkPermission(WriteTool, { file_path: '/etc/passwd', content: 'hack' }, ctx, mockToolContext)
      expect(result.behavior).toBe('allow')
    })

    it('deny rule blocks even in default mode', async () => {
      const ctx = createPermissionContext('default', {
        alwaysDenyRules: [{ source: 'userSettings', behavior: 'deny', toolName: 'Write' }],
      })
      const result = await checkPermission(WriteTool, { file_path: '/tmp/x', content: 'test' }, ctx, mockToolContext)
      expect(result.behavior).toBe('deny')
    })

    it('allow rule permits in default mode', async () => {
      const ctx = createPermissionContext('default', {
        alwaysAllowRules: [{ source: 'userSettings', behavior: 'allow', toolName: 'Bash', ruleContent: 'ls *' }],
      })
      const result = await checkPermission(BashTool, { command: 'ls -la' }, ctx, mockToolContext)
      expect(result.behavior).toBe('allow')
    })

    it('auto mode allows read-only tools', async () => {
      const ctx = createPermissionContext('auto')
      const result = await checkPermission(ReadOnlyTool, { file_path: '/tmp/x' }, ctx, mockToolContext)
      expect(result.behavior).toBe('allow')
    })

    it('auto mode asks for write tools', async () => {
      const ctx = createPermissionContext('auto')
      const result = await checkPermission(WriteTool, { file_path: '/tmp/x', content: 'data' }, ctx, mockToolContext)
      expect(result.behavior).toBe('ask')
    })

    it('default mode asks for all tools', async () => {
      const ctx = createPermissionContext('default')
      const result = await checkPermission(ReadOnlyTool, { file_path: '/tmp/x' }, ctx, mockToolContext)
      expect(result.behavior).toBe('ask')
    })

    it('deny rules take priority over allow rules', async () => {
      const ctx = createPermissionContext('default', {
        alwaysDenyRules: [{ source: 'localSettings', behavior: 'deny', toolName: 'Bash' }],
        alwaysAllowRules: [{ source: 'userSettings', behavior: 'allow', toolName: 'Bash' }],
      })
      const result = await checkPermission(BashTool, { command: 'ls' }, ctx, mockToolContext)
      expect(result.behavior).toBe('deny')
    })
  })

  describe('createPermissionContext', () => {
    it('creates default context', () => {
      const ctx = createPermissionContext()
      expect(ctx.mode).toBe('default')
      expect(ctx.alwaysAllowRules).toEqual([])
      expect(ctx.alwaysDenyRules).toEqual([])
    })

    it('accepts overrides', () => {
      const rules = [{ source: 'userSettings' as const, behavior: 'allow' as const, toolName: 'Read' }]
      const ctx = createPermissionContext('auto', { alwaysAllowRules: rules })
      expect(ctx.mode).toBe('auto')
      expect(ctx.alwaysAllowRules).toEqual(rules)
    })
  })
})
