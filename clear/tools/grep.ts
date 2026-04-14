/**
 * Grep Tool — 内容搜索
 * 简化自 src/tools/GrepTool/GrepTool.ts
 */

import { z } from 'zod/v4'
import { buildTool } from '../core/tool.js'

export const GrepTool = buildTool({
  name: 'Grep',
  maxResultSizeChars: 100_000,
  searchHint: 'search file contents with regex',

  inputSchema: z.object({
    pattern: z.string().describe('The regex pattern to search for'),
    path: z.string().optional().describe('File or directory to search'),
    output_mode: z.enum(['content', 'files_with_matches', 'count']).optional(),
    '-i': z.boolean().optional().describe('Case insensitive'),
    '-C': z.number().optional().describe('Context lines'),
    type: z.string().optional().describe('File type filter (js, py, rust...)'),
  }),

  call: async (input, context) => {
    // 真实实现: 调用 ripgrep (rg)
    return {
      data: {
        pattern: input.pattern,
        matches: [
          { file: 'src/index.ts', line: 42, text: `match of "${input.pattern}"` },
        ],
        totalMatches: 1,
        durationMs: 8,
      },
    }
  },

  description: async (input) => `Searching for "${input.pattern}" in ${input.path ?? 'cwd'}`,

  prompt: async () => `Search file contents using regex patterns. Supports multiple output modes and file type filtering.`,

  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  isDestructive: () => false,

  isSearchOrReadCommand: () => ({ isSearch: true, isRead: false }),
  interruptBehavior: () => 'cancel',
})
