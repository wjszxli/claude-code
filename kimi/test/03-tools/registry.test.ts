import { describe, it, expect, beforeEach } from 'vitest'
import { registerTool, getTool, getAllTools, getToolsForContext, clearRegistry } from '@/03-tools/registry.js'
import { buildTool } from '@/03-tools/factory.js'
import type { ToolPermissionContext } from '@/00-core/types.js'

describe('03-tools/registry', () => {
  beforeEach(() => clearRegistry())

  const makeTool = (name: string, overrides?: { isEnabled?: () => boolean }) =>
    buildTool({ name, description: `${name} tool`, inputSchema: {}, call: async () => null, ...overrides })

  describe('registerTool + getTool', () => {
    it('registers and retrieves a tool', () => {
      const tool = makeTool('bash')
      registerTool(tool)
      expect(getTool('bash')).toBe(tool)
    })

    it('returns undefined for unregistered tool', () => {
      expect(getTool('nonexistent')).toBeUndefined()
    })

    it('overwrites tool with same name', () => {
      registerTool(makeTool('bash'))
      registerTool(makeTool('bash'))
      // Still only one tool registered
      expect(getAllTools()).toHaveLength(1)
    })
  })

  describe('getAllTools', () => {
    it('returns all registered tools', () => {
      registerTool(makeTool('a'))
      registerTool(makeTool('b'))
      expect(getAllTools()).toHaveLength(2)
    })

    it('filters out disabled tools', () => {
      registerTool(makeTool('enabled'))
      registerTool(makeTool('disabled', { isEnabled: () => false }))
      const all = getAllTools()
      expect(all).toHaveLength(1)
      expect(all[0].name).toBe('enabled')
    })

    it('returns empty when no tools', () => {
      expect(getAllTools()).toEqual([])
    })
  })

  describe('getToolsForContext', () => {
    it('filters denied tools', () => {
      registerTool(makeTool('Bash'))
      registerTool(makeTool('Read'))
      registerTool(makeTool('Write'))

      const ctx: ToolPermissionContext = { mode: 'default', deniedTools: ['Bash', 'Write'] }
      const filtered = getToolsForContext(ctx)
      expect(filtered).toHaveLength(1)
      expect(filtered[0].name).toBe('Read')
    })

    it('returns all when no denied tools', () => {
      registerTool(makeTool('a'))
      registerTool(makeTool('b'))
      const filtered = getToolsForContext({ mode: 'default', deniedTools: [] })
      expect(filtered).toHaveLength(2)
    })

    it('returns empty when all denied', () => {
      registerTool(makeTool('Bash'))
      const filtered = getToolsForContext({ mode: 'default', deniedTools: ['Bash'] })
      expect(filtered).toHaveLength(0)
    })
  })

  describe('clearRegistry', () => {
    it('clears all tools', () => {
      registerTool(makeTool('a'))
      registerTool(makeTool('b'))
      clearRegistry()
      expect(getAllTools()).toEqual([])
      expect(getTool('a')).toBeUndefined()
    })
  })
})
