/**
 * FileReadTool / FileEditTool —— 文件操作工具
 * ============================================================================
 * 设计思想：
 * 文件读写是 LLM 与代码库交互的基础。原项目中的 FileReadTool 支持缓存、
 * 批量读取、file history 快照；FileEditTool 支持基于 diff 的安全编辑。
 *
 * 简化版使用内存文件系统 Mock，但显式区分 isReadOnly 与 isDestructive，
 * 以体现权限系统如何根据工具元数据做并发编排和权限决策。
 * ============================================================================
 */

import { buildTool } from './factory.js';

// 内存文件系统 Mock
export const mockFs = new Map<string, string>();

export const FileReadTool = buildTool<{ path: string }, string>({
  name: 'file_read',
  description: 'Read the contents of a file',
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string' } },
    required: ['path'],
  },
  isReadOnly: () => true, // 只读操作，允许批量并发
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
  isDestructive: () => true, // 修改文件内容，需权限确认
  call: async (input) => {
    const content = mockFs.get(input.path);
    if (content === undefined) throw new Error(`File not found: ${input.path}`);
    if (!content.includes(input.oldText)) throw new Error(`oldText not found in ${input.path}`);
    const updated = content.replace(input.oldText, input.newText);
    mockFs.set(input.path, updated);
    return updated;
  },
});
