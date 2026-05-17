/**
 * Bash Tool — Shell 命令执行
 * 简化自 src/tools/BashTool/BashTool.ts (原文件 800+ 行)
 *
 * 核心设计:
 *   - 命令分类: search/read/list → UI 可折叠
 *   - 超时控制: 默认 120s
 *   - 安全限制: 阻止危险命令
 */

import { z } from 'zod/v4'
import { buildTool } from '../core/tool.js'

// 命令分类 (用于 UI 折叠)
const SEARCH_COMMANDS = new Set(['find', 'grep', 'rg', 'ag', 'which'])
const READ_COMMANDS = new Set(['cat', 'head', 'tail', 'wc', 'stat', 'file', 'jq'])
const LIST_COMMANDS = new Set(['ls', 'tree', 'du'])

function classifyCommand(command: string): { isSearch: boolean; isRead: boolean; isList: boolean } {
  const base = command.trim().split(/\s+/)[0] ?? ''
  return {
    isSearch: SEARCH_COMMANDS.has(base),
    isRead: READ_COMMANDS.has(base),
    isList: LIST_COMMANDS.has(base),
  }
}

export const BashTool = buildTool({
  name: 'Bash',
  maxResultSizeChars: 100_000,

  inputSchema: z.object({
    command: z.string().describe('The bash command to run'),
    description: z.string().optional().describe('What this command does'),
    timeout: z.number().optional().describe('Timeout in milliseconds'),
  }),

  call: async (input, context) => {
    // 真实实现: execa(input.command, { timeout, signal })
    // 简化: 返回模拟结果
    const classification = classifyCommand(input.command)
    return {
      data: {
        stdout: `[simulated output of: ${input.command}]`,
        exitCode: 0,
        ...classification,
      },
    }
  },

  description: async (input) => input.description ?? `Run: ${input.command}`,

  prompt: async () => `Execute a bash command and return its output.
Commands run in a persistent shell environment. Use for system operations, file manipulation, running tests, etc.`,

  isReadOnly: (input) => {
    const classification = classifyCommand(input.command)
    return classification.isSearch || classification.isRead || classification.isList
  },

  isConcurrencySafe: () => false,
  isDestructive: () => false,

  isSearchOrReadCommand: (input) => classifyCommand(input.command),

  interruptBehavior: () => 'cancel',

  getPath: (input) => {
    // 从命令中提取路径 (简化)
    const parts = input.command.trim().split(/\s+/)
    return parts[parts.length - 1] ?? ''
  },
})
