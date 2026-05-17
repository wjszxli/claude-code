import { describe, it, expect } from 'vitest';
import { buildTool, executeTool } from './index.js';
import type { ToolUseContext } from './types.js';
import { getDefaultAppState } from '../core/types.js';

const makeContext = (mode = 'default'): ToolUseContext => ({
  getAppState: () => getDefaultAppState(),
  setAppState: () => {},
  permissionContext: { mode: mode as any, deniedTools: [] },
  abortController: new AbortController(),
});

describe('buildTool', () => {
  it('should fill defaults', () => {
    const tool = buildTool({
      name: 'echo',
      description: 'echo',
      inputSchema: {},
      call: async (input: string) => input,
    });
    expect(tool.isEnabled()).toBe(true);
    expect(tool.isReadOnly()).toBe(false);
    expect(tool.isDestructive()).toBe(false);
  });

  it('should respect explicit flags', () => {
    const tool = buildTool({
      name: 'rm',
      description: 'remove',
      inputSchema: {},
      call: async () => 'ok',
      isReadOnly: () => true,
      isDestructive: () => true,
    });
    expect(tool.isReadOnly()).toBe(true);
    expect(tool.isDestructive()).toBe(true);
  });
});

describe('executeTool', () => {
  it('should execute allowed tool', async () => {
    const tool = buildTool({
      name: 'echo',
      description: 'echo',
      inputSchema: {},
      call: async (input: string) => `result: ${input}`,
    });
    const result = await executeTool(tool, 'hello', makeContext());
    expect(result).toBe('result: hello');
  });

  it('should deny destructive in default mode', async () => {
    const tool = buildTool({
      name: 'rm',
      description: 'remove',
      inputSchema: {},
      call: async () => 'ok',
      isDestructive: () => true,
    });
    await expect(executeTool(tool, {}, makeContext())).rejects.toThrow('Permission required');
  });

  it('should allow destructive in yolo mode', async () => {
    const tool = buildTool({
      name: 'rm',
      description: 'remove',
      inputSchema: {},
      call: async () => 'ok',
      isDestructive: () => true,
    });
    const result = await executeTool(tool, {}, makeContext('yolo'));
    expect(result).toBe('ok');
  });

  it('should use updatedInput after permissions', async () => {
    const tool = buildTool({
      name: 'write',
      description: 'write',
      inputSchema: {},
      call: async (input: { path: string }) => input.path,
      checkPermissions: async (input) => ({ behavior: 'allow', updatedInput: { path: `${input.path}.verified` } }),
    });
    const result = await executeTool(tool, { path: 'file.txt' }, makeContext());
    expect(result).toBe('file.txt.verified');
  });
});
