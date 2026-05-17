import { describe, it, expect } from 'vitest'
import { buildTool, executeTool } from '@/03-tools/factory.js'
import type { ToolUseContext } from '@/03-tools/types.js'
import { getDefaultAppState } from '@/00-core/types.js'

function makeCtx(overrides?: Partial<ToolUseContext>): ToolUseContext {
  const state = getDefaultAppState()
  return {
    getAppState: () => state,
    setAppState: (u) => { Object.assign(state, u(state)) },
    permissionContext: { mode: 'yolo', deniedTools: [] },
    abortController: new AbortController(),
    ...overrides,
  }
}

describe('03-tools/factory', () => {
  describe('buildTool', () => {
    it('fills isEnabled default (true)', () => {
      const tool = buildTool({ name: 't', description: '', inputSchema: {}, call: async () => null })
      expect(tool.isEnabled()).toBe(true)
    })

    it('fills isReadOnly default (false)', () => {
      const tool = buildTool({ name: 't', description: '', inputSchema: {}, call: async () => null })
      expect(tool.isReadOnly()).toBe(false)
    })

    it('fills isDestructive default (false)', () => {
      const tool = buildTool({ name: 't', description: '', inputSchema: {}, call: async () => null })
      expect(tool.isDestructive()).toBe(false)
    })

    it('preserves custom isEnabled', () => {
      const tool = buildTool({ name: 't', description: '', inputSchema: {}, call: async () => null, isEnabled: () => false })
      expect(tool.isEnabled()).toBe(false)
    })

    it('preserves custom isReadOnly', () => {
      const tool = buildTool({ name: 't', description: '', inputSchema: {}, call: async () => null, isReadOnly: () => true })
      expect(tool.isReadOnly()).toBe(true)
    })

    it('preserves custom isDestructive', () => {
      const tool = buildTool({ name: 't', description: '', inputSchema: {}, call: async () => null, isDestructive: () => true })
      expect(tool.isDestructive()).toBe(true)
    })

    it('default checkPermissions delegates to checkToolPermission', async () => {
      const tool = buildTool({ name: 'Bash', description: '', inputSchema: {}, call: async () => null, isDestructive: () => true })
      const ctx = makeCtx({ permissionContext: { mode: 'auto', deniedTools: [] } })
      const result = await tool.checkPermissions({}, ctx)
      // auto mode + destructive → ask
      expect(result.behavior).toBe('ask')
    })

    it('preserves custom checkPermissions', async () => {
      const tool = buildTool({
        name: 't', description: '', inputSchema: {}, call: async () => null,
        checkPermissions: async (input) => ({ behavior: 'allow' as const, updatedInput: input }),
      })
      const result = await tool.checkPermissions({}, makeCtx())
      expect(result.behavior).toBe('allow')
    })
  })

  describe('executeTool', () => {
    it('executes when permission allows', async () => {
      const tool = buildTool<{ x: number }, number>({
        name: 'add', description: '', inputSchema: {},
        call: async (input) => input.x + 1,
      })
      const ctx = makeCtx({ permissionContext: { mode: 'yolo', deniedTools: [] } })
      const result = await executeTool(tool, { x: 41 }, ctx)
      expect(result).toBe(42)
    })

    it('throws when permission denies', async () => {
      const tool = buildTool({
        name: 'Bash', description: '', inputSchema: {},
        call: async () => 'ok',
      })
      const ctx = makeCtx({ permissionContext: { mode: 'default', deniedTools: ['Bash'] } })
      await expect(executeTool(tool, {}, ctx)).rejects.toThrow('Permission denied')
    })

    it('throws when permission asks (not allowed)', async () => {
      const tool = buildTool({
        name: 'Bash', description: '', inputSchema: {},
        call: async () => 'ok',
        isDestructive: () => true,
      })
      const ctx = makeCtx({ permissionContext: { mode: 'auto', deniedTools: [] } })
      await expect(executeTool(tool, {}, ctx)).rejects.toThrow('Permission required')
    })

    it('uses updatedInput from permission check', async () => {
      const tool = buildTool<{ val: string }, string>({
        name: 't', description: '', inputSchema: {},
        call: async (input) => input.val.toUpperCase(),
        checkPermissions: async (input) => ({ behavior: 'allow', updatedInput: { val: input.val + '-sanitized' } }),
      })
      const ctx = makeCtx()
      const result = await executeTool(tool, { val: 'test' }, ctx)
      expect(result).toBe('TEST-SANITIZED')
    })
  })
})
