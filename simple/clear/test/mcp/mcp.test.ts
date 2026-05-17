/**
 * MCP Integration Tests
 * 验证 MCP 客户端、工具转换、服务器管理
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  McpClient,
  mcpToolToTool,
} from '../../mcp/mcp.js'

describe('mcp/mcp', () => {
  describe('mcpToolToTool', () => {
    it('creates tool with prefixed name', () => {
      const tool = mcpToolToTool('filesystem', {
        name: 'read_file',
        description: 'Read a file',
        inputSchema: { type: 'object' },
      })
      expect(tool.name).toBe('mcp__filesystem__read_file')
    })

    it('tool is marked as MCP', () => {
      const tool = mcpToolToTool('server', {
        name: 'tool',
        description: 'desc',
        inputSchema: {},
      })
      expect((tool as any).isMcp).toBe(true)
    })

    it('tool inherits description', async () => {
      const tool = mcpToolToTool('server', {
        name: 'search',
        description: 'Search the web',
        inputSchema: {},
      })
      const desc = await tool.description({})
      expect(desc).toBe('Search the web')
    })

    it('tool defaults to read-only', () => {
      const tool = mcpToolToTool('server', {
        name: 'tool',
        description: '',
        inputSchema: {},
      })
      expect(tool.isReadOnly({})).toBe(true)
    })
  })

  describe('McpClient', () => {
    let client: McpClient

    beforeEach(() => {
      client = new McpClient()
    })

    it('connect adds a server', async () => {
      const server = await client.connect('test-server', {
        type: 'stdio',
        command: 'npx',
        args: ['test'],
        scope: 'user',
      })
      expect(server.status).toBe('connected')
      expect(server.name).toBe('test-server')
    })

    it('getServers returns connected servers', async () => {
      await client.connect('s1', { type: 'stdio', command: 'c', args: [], scope: 'user' })
      await client.connect('s2', { type: 'sse', url: 'http://test', scope: 'project' })
      expect(client.getServers()).toHaveLength(2)
    })

    it('disconnect removes a server', async () => {
      await client.connect('s1', { type: 'stdio', command: 'c', args: [], scope: 'user' })
      await client.disconnect('s1')
      expect(client.getServers()).toHaveLength(0)
    })

    it('getServer returns server by name', async () => {
      await client.connect('my-server', { type: 'http', url: 'http://test', scope: 'local' })
      const server = client.getServer('my-server')
      expect(server?.name).toBe('my-server')
    })

    it('getServer returns undefined for unknown', () => {
      expect(client.getServer('unknown')).toBeUndefined()
    })

    it('getAllTools returns empty when no tools discovered', async () => {
      await client.connect('empty', { type: 'stdio', command: 'c', args: [], scope: 'user' })
      expect(client.getAllTools()).toEqual([])
    })
  })
})
