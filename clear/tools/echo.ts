/**
 * Echo Tool — 回显工具
 * 简化工具实现的示例
 */

import { z } from 'zod/v4'
import { buildTool } from '../core/tool.js'

export const EchoTool = buildTool({
  name: 'echo',
  maxResultSizeChars: 10_000,

  inputSchema: z.object({
    message: z.string().min(1).describe('The message to echo back'),
  }),

  call: async (input) => {
    return { data: input.message }
  },

  description: async (input) => `Echo: ${input.message}`,

  prompt: async () => 'Echo the input message back to the user.',

  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  isDestructive: () => false,
})
