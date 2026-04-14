/**
 * FileReadTool / FileEditTool 简化版
 * 对应原项目：tools/FileReadTool/, tools/FileEditTool/
 * 使用内存 Mock 替代真实文件系统
 */

import { buildTool } from './index.js';

// 内存文件系统 Mock
export const mockFs = new Map<string, string>();

export const FileReadTool = buildTool<{ path: string }, string>({
  name: 'file_read',
  description: 'Read a file',
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string' } },
    required: ['path'],
  },
  isReadOnly: () => true,
  call: async (input) => {
    const content = mockFs.get(input.path);
    if (content === undefined) throw new Error(`File not found: ${input.path}`);
    return content;
  },
});

export const FileEditTool = buildTool<{ path: string; oldText: string; newText: string }, string>({
  name: 'file_edit',
  description: 'Edit a file by replacing oldText with newText',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      oldText: { type: 'string' },
      newText: { type: 'string' },
    },
    required: ['path', 'oldText', 'newText'],
  },
  isDestructive: () => true,
  call: async (input) => {
    const content = mockFs.get(input.path);
    if (content === undefined) throw new Error(`File not found: ${input.path}`);
    if (!content.includes(input.oldText)) throw new Error(`oldText not found in ${input.path}`);
    const updated = content.replace(input.oldText, input.newText);
    mockFs.set(input.path, updated);
    return updated;
  },
});
