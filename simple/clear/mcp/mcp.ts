/**
 * MCP (Model Context Protocol) 集成
 * 简化自 src/services/mcp/ (原目录 30+ 文件)
 *
 * 核心设计:
 *   - MCP 允许外部进程注册工具到 Claude Code
 *   - 传输层: stdio / sse / http / ws
 *   - 工具发现: 连接后自动发现服务器的 tools/resources
 *   - 生命周期: connect → discover → use → disconnect
 *
 * MCP 连接模型:
 *
 *   Claude Code                        MCP Server
 *   ┌──────────┐    stdio/sse/http     ┌──────────┐
 *   │ Client    │◄──────────────────►│ Server    │
 *   │           │  1. initialize       │           │
 *   │           │  2. tools/list       │           │
 *   │           │  3. tools/call       │           │
 *   └──────────┘                      └──────────┘
 */

import type { Tool, Tools } from '../core/tool.js'
import { buildTool } from '../core/tool.js'
import { z } from 'zod/v4'

// ────────────────────────────────────────────
// MCP Config Types
// ────────────────────────────────────────────

/** 配置来源 */
export type ConfigScope =
  | 'local'       // .claude/settings.local.json
  | 'user'        // ~/.claude/settings.json
  | 'project'     // .claude/settings.json
  | 'enterprise'  // 企业管理

/** 传输协议类型 */
export type Transport = 'stdio' | 'sse' | 'http' | 'ws'

/** stdio 服务器配置 */
export type StdioServerConfig = {
  type: 'stdio'
  command: string       // e.g. "npx"
  args: string[]        // e.g. ["-y", "@modelcontextprotocol/server-filesystem"]
  env?: Record<string, string>
}

/** SSE 服务器配置 */
export type SseServerConfig = {
  type: 'sse'
  url: string
  headers?: Record<string, string>
}

/** HTTP 服务器配置 */
export type HttpServerConfig = {
  type: 'http'
  url: string
  headers?: Record<string, string>
}

/** MCP 服务器配置 (联合类型) */
export type McpServerConfig =
  | StdioServerConfig
  | SseServerConfig
  | HttpServerConfig

/** 带作用域的配置 */
export type ScopedConfig = McpServerConfig & {
  scope: ConfigScope
}

// ────────────────────────────────────────────
// MCP Connection States
// ────────────────────────────────────────────

/** 已连接的 MCP 服务器 */
export type ConnectedServer = {
  name: string
  status: 'connected'
  config: ScopedConfig
  tools: McpToolDef[]
  toolCount: number
}

/** 连接失败的 MCP 服务器 */
export type FailedServer = {
  name: string
  status: 'failed'
  config: ScopedConfig
  error: string
}

/** MCP 服务器状态 */
export type McpServer = ConnectedServer | FailedServer

// ────────────────────────────────────────────
// MCP Tool — 从 MCP 服务器发现的工具
// ────────────────────────────────────────────

/** MCP 工具定义 (从服务器获取) */
export type McpToolDef = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/**
 * 将 MCP 工具转换为 Claude Code Tool
 *
 * 对应源码 src/services/mcp/ 中 createToolFromMcp() 的核心逻辑
 * MCP 工具通过 mcpInfo 标识来源
 */
export function mcpToolToTool(
  serverName: string,
  toolDef: McpToolDef,
): Tool {
  const fullName = `mcp__${serverName}__${toolDef.name}`

  return buildTool({
    name: fullName,
    maxResultSizeChars: 50_000,

    inputSchema: z.record(z.unknown()) as any,

    call: async (input, context) => {
      // 真实实现: 通过 MCP client 发送 tools/call 请求
      return {
        data: {
          serverName,
          toolName: toolDef.name,
          result: `[MCP tool call: ${toolDef.name}]`,
        },
      }
    },

    description: async () => toolDef.description,

    prompt: async () => toolDef.description,

    isReadOnly: () => true,
    isConcurrencySafe: () => false,
    isDestructive: () => false,
    isMcp: true,
  })
}

// ────────────────────────────────────────────
// MCP Client
// ────────────────────────────────────────────

/**
 * McpClient — MCP 客户端
 *
 * 管理:
 *   - 服务器连接/断开
 *   - 工具发现
 *   - 工具调用代理
 */
export class McpClient {
  private servers = new Map<string, McpServer>()

  /** 连接服务器 */
  async connect(name: string, config: ScopedConfig): Promise<McpServer> {
    try {
      // 真实实现: 启动子进程 (stdio) 或建立 HTTP 连接
      // 发送 initialize + tools/list 请求

      // 模拟: 返回已连接状态
      const server: ConnectedServer = {
        name,
        status: 'connected',
        config,
        tools: [],
        toolCount: 0,
      }

      this.servers.set(name, server)
      return server
    } catch (error) {
      const server: FailedServer = {
        name,
        status: 'failed',
        config,
        error: error instanceof Error ? error.message : String(error),
      }
      this.servers.set(name, server)
      return server
    }
  }

  /** 断开服务器 */
  async disconnect(name: string): Promise<void> {
    const server = this.servers.get(name)
    if (server?.status === 'connected') {
      // 真实实现: 发送 shutdown, 清理子进程
      this.servers.delete(name)
    }
  }

  /** 获取所有已连接服务器的工具 */
  getAllTools(): Tool[] {
    const tools: Tool[] = []
    for (const server of this.servers.values()) {
      if (server.status === 'connected') {
        for (const toolDef of server.tools) {
          tools.push(mcpToolToTool(server.name, toolDef))
        }
      }
    }
    return tools
  }

  /** 获取服务器列表 */
  getServers(): McpServer[] {
    return Array.from(this.servers.values())
  }

  /** 按名称获取服务器 */
  getServer(name: string): McpServer | undefined {
    return this.servers.get(name)
  }
}
