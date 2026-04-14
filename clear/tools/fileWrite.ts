/**
 * FileWrite Tool — 文件写入
 * 简化自 src/tools/FileWriteTool/FileWriteTool.ts
 *
 * 核心设计:
 *   - 完整写入 (不是增量)
 *   - 对于已读取的文件更宽松的权限
 */

import { z } from 'zod/v4'
import { buildTool } from '../core/tool.js'

export const FileWriteTool = buildTool({
  name: 'Write',
  maxResultSizeChars: 10_000,
  searchHint: 'create or overwrite files',

  inputSchema: z.object({
    file_path: z.string().describe('Absolute path to write the file'),
    content: z.string().describe('The content to write'),
  }),

  call: async (input, context) => {
    // 真实实现: fs.writeFile(file_path, content, 'utf8')
    return {
      data: {
        path: input.file_path,
        bytesWritten: input.content.length,
      },
    }
  },

  description: async (input) => `Writing ${input.content.length} chars to ${input.file_path}`,

  prompt: async () => `Write content to a file. Creates the file if it doesn't exist, overwrites if it does.
Use for creating new files or complete rewrites.`,

  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  isDestructive: () => true,

  interruptBehavior: () => 'block',
  getPath: (input) => input.file_path,
})
