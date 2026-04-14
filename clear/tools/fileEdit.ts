/**
 * FileEdit Tool — 文件编辑
 * 简化自 src/tools/FileEditTool/FileEditTool.ts
 *
 * 核心设计:
 *   - 精确字符串替换 (不是行号替换)
 *   - 要求 old_string 在文件中唯一
 *   - 支持通过 replace_all 替换所有匹配
 */

import { z } from 'zod/v4'
import { buildTool } from '../core/tool.js'

export const FileEditTool = buildTool({
  name: 'Edit',
  maxResultSizeChars: 100_000,
  searchHint: 'modify file contents in place',

  inputSchema: z.object({
    file_path: z.string().describe('Absolute path to the file to modify'),
    old_string: z.string().describe('The text to replace'),
    new_string: z.string().describe('The text to replace it with'),
    replace_all: z.boolean().optional().describe('Replace all occurrences of old_string'),
  }),

  validateInput: async (input) => {
    if (!input.old_string) {
      return { result: false as const, message: 'old_string is required' }
    }
    if (input.old_string === input.new_string) {
      return { result: false as const, message: 'old_string and new_string are identical' }
    }
    return { result: true as const }
  },

  call: async (input, context) => {
    // 真实实现:
    //   1. fs.readFile(file_path)
    //   2. 查找 old_string 位置
    //   3. 替换为 new_string
    //   4. fs.writeFile(file_path)
    return {
      data: {
        path: input.file_path,
        replaced: 1,
        snippet: input.new_string.slice(0, 100),
      },
    }
  },

  description: async (input) => {
    const preview = input.old_string?.slice(0, 50) ?? ''
    return `Editing ${input.file_path}: "${preview}..." → "${input.new_string?.slice(0, 50) ?? ''}"`
  },

  prompt: async () => `Perform exact string replacements in files.
Finds old_string in the file and replaces it with new_string.
old_string must be unique in the file (unless replace_all is true).`,

  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  isDestructive: () => false,

  interruptBehavior: () => 'block',
  getPath: (input) => input.file_path,
})
