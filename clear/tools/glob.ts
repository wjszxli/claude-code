/**
 * Glob Tool — 文件搜索
 * 简化自 src/tools/GlobTool/GlobTool.ts
 */

import { z } from 'zod/v4'
import { buildTool } from '../core/tool.js'

export const GlobTool = buildTool({
  name: 'Glob',
  maxResultSizeChars: 100_000,
  searchHint: 'find files by pattern',

  inputSchema: z.object({
    pattern: z.string().describe('The glob pattern to match files against'),
    path: z.string().optional().describe('The directory to search in'),
  }),

  call: async (input, context) => {
    // 真实实现: picomatch / bfs glob
    return {
      data: {
        pattern: input.pattern,
        files: [`src/index.ts`, `src/utils.ts`], // simulated
        count: 2,
        durationMs: 12,
      },
    }
  },

  description: async (input) => `Searching for files matching "${input.pattern}"`,

  prompt: async () => `Search for files matching a glob pattern. Returns matching file paths.`,

  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  isDestructive: () => false,

  isSearchOrReadCommand: () => ({ isSearch: true, isRead: false }),
  interruptBehavior: () => 'cancel',
})
