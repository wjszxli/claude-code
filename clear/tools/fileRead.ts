/**
 * FileRead Tool — 文件读取
 * 简化自 src/tools/FileReadTool/FileReadTool.ts
 *
 * 核心设计:
 *   - 支持 offset + limit 分页读取
 *   - 安全: 阻止读取设备文件
 *   - 缓存: readFileState 避免重复读取
 */

import { z } from 'zod/v4'
import { buildTool } from '../core/tool.js'

const BLOCKED_PATHS = new Set([
  '/dev/zero', '/dev/full', '/dev/random', '/dev/urandom',
])

export const FileReadTool = buildTool({
  name: 'Read',
  maxResultSizeChars: Infinity, // 不持久化到磁盘 (避免循环)
  searchHint: 'read file contents',

  inputSchema: z.object({
    file_path: z.string().describe('Absolute path to the file to read'),
    offset: z.number().optional().describe('Line number to start reading from'),
    limit: z.number().optional().describe('Number of lines to read'),
  }),

  validateInput: async (input) => {
    if (BLOCKED_PATHS.has(input.file_path)) {
      return { result: false as const, message: `Cannot read device file: ${input.file_path}` }
    }
    return { result: true as const }
  },

  call: async (input, context) => {
    // 真实实现: fs.readFile(input.file_path, 'utf8')
    return {
      data: {
        path: input.file_path,
        content: `[simulated file content of ${input.file_path}]`,
        lines: 42,
      },
    }
  },

  description: async (input) => `Reading ${input.file_path}`,

  prompt: async () => `Read a file from the local filesystem. Supports reading specific line ranges with offset and limit parameters.`,

  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  isDestructive: () => false,

  isSearchOrReadCommand: () => ({ isSearch: false, isRead: true }),

  interruptBehavior: () => 'cancel',
  getPath: (input) => input.file_path,
})
