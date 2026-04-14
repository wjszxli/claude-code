/**
 * Tools Tests
 * 验证工具实现和工具注册表
 */

import { describe, it, expect } from 'vitest'
import {
  getAllBaseTools,
  assembleToolPool,
} from '../../tools/index.js'

describe('tools/index', () => {
  describe('getAllBaseTools', () => {
    it('returns all built-in tools', () => {
      const tools = getAllBaseTools()
      const names = tools.map(t => t.name)

      expect(names).toContain('Bash')
      expect(names).toContain('Read')
      expect(names).toContain('Edit')
      expect(names).toContain('Write')
      expect(names).toContain('Glob')
      expect(names).toContain('Grep')
      expect(names).toContain('echo')
    })

    it('all tools have required properties', () => {
      const tools = getAllBaseTools()
      for (const tool of tools) {
        expect(tool.name).toBeTruthy()
        expect(typeof tool.call).toBe('function')
        expect(typeof tool.description).toBe('function')
        expect(typeof tool.prompt).toBe('function')
        expect(typeof tool.isReadOnly).toBe('function')
        expect(typeof tool.isEnabled).toBe('function')
        expect(typeof tool.maxResultSizeChars).toBe('number')
      }
    })
  })

  describe('assembleToolPool', () => {
    it('combines built-in and MCP tools', () => {
      const builtIn = getAllBaseTools()
      const mcpTool = {
        name: 'mcp__server__tool1',
        maxResultSizeChars: 100,
        inputSchema: {},
        call: async () => ({ data: null }),
        description: async () => '',
        prompt: async () => '',
        isReadOnly: () => true,
        isConcurrencySafe: () => false,
        isDestructive: () => false,
        isEnabled: () => true,
        userFacingName: () => 'mcp_tool',
        checkPermissions: async (i: any) => ({ behavior: 'allow' as const, updatedInput: i }),
        interruptBehavior: () => 'block' as const,
      }

      const pool = assembleToolPool(builtIn, [mcpTool])
      expect(pool.length).toBe(builtIn.length + 1)
    })

    it('filters denied tools', () => {
      const builtIn = getAllBaseTools()
      const pool = assembleToolPool(builtIn, [], ['Bash', 'Write'])

      const names = pool.map(t => t.name)
      expect(names).not.toContain('Bash')
      expect(names).not.toContain('Write')
      expect(names).toContain('Read')
    })

    it('built-in tools take precedence over MCP tools on name collision', () => {
      const builtIn = getAllBaseTools()
      const duplicateMcp = {
        ...builtIn[0]!,
        name: builtIn[0]!.name, // same name
      }

      const pool = assembleToolPool(builtIn, [duplicateMcp])
      const builtInCount = builtIn.length
      expect(pool.length).toBe(builtInCount) // no duplicate
    })
  })
})

// 测试单个工具的行为
describe('tools/echo', () => {
  it('echoes input', async () => {
    const { EchoTool } = await import('../../tools/echo.js')
    const result = await EchoTool.call({ message: 'hello world' }, {
      abortController: new AbortController(),
      getAppState: () => ({ messages: [], tasks: {}, settings: { permissionMode: 'default', model: '' } }),
      setAppState: () => {},
      messages: [],
      debug: false,
    })
    expect(result.data).toBe('hello world')
  })
})

describe('tools/bash', () => {
  it('classifies search commands as read-only', async () => {
    const { BashTool } = await import('../../tools/bash.js')
    expect(BashTool.isReadOnly({ command: 'grep pattern' })).toBe(true)
    expect(BashTool.isReadOnly({ command: 'find . -name "*.ts"' })).toBe(true)
    expect(BashTool.isReadOnly({ command: 'npm test' })).toBe(false)
  })

  it('cancel interrupt behavior', async () => {
    const { BashTool } = await import('../../tools/bash.js')
    expect(BashTool.interruptBehavior()).toBe('cancel')
  })
})

describe('tools/fileRead', () => {
  it('is read-only', async () => {
    const { FileReadTool } = await import('../../tools/fileRead.js')
    expect(FileReadTool.isReadOnly({ file_path: '/tmp/x' })).toBe(true)
  })

  it('validates against blocked paths', async () => {
    const { FileReadTool } = await import('../../tools/fileRead.js')
    const result = await FileReadTool.validateInput!({ file_path: '/dev/zero' }, {
      abortController: new AbortController(),
      getAppState: () => ({ messages: [], tasks: {}, settings: { permissionMode: 'default', model: '' } }),
      setAppState: () => {},
      messages: [],
      debug: false,
    })
    expect(result.result).toBe(false)
  })
})

describe('tools/fileEdit', () => {
  it('is not read-only', async () => {
    const { FileEditTool } = await import('../../tools/fileEdit.js')
    expect(FileEditTool.isReadOnly({ file_path: '/tmp/x', old_string: 'a', new_string: 'b' })).toBe(false)
  })

  it('validates empty old_string', async () => {
    const { FileEditTool } = await import('../../tools/fileEdit.js')
    const result = await FileEditTool.validateInput!({ file_path: '/tmp/x', old_string: '', new_string: 'b' }, {
      abortController: new AbortController(),
      getAppState: () => ({ messages: [], tasks: {}, settings: { permissionMode: 'default', model: '' } }),
      setAppState: () => {},
      messages: [],
      debug: false,
    })
    expect(result.result).toBe(false)
  })

  it('validates identical strings', async () => {
    const { FileEditTool } = await import('../../tools/fileEdit.js')
    const result = await FileEditTool.validateInput!({ file_path: '/tmp/x', old_string: 'a', new_string: 'a' }, {
      abortController: new AbortController(),
      getAppState: () => ({ messages: [], tasks: {}, settings: { permissionMode: 'default', model: '' } }),
      setAppState: () => {},
      messages: [],
      debug: false,
    })
    expect(result.result).toBe(false)
  })
})
