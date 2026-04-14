import { describe, it, expect, beforeEach } from 'vitest';
import { FileReadTool, FileEditTool, mockFs } from './file.js';
import { executeTool } from './index.js';
import { getDefaultAppState } from '../core/types.js';
import type { ToolUseContext } from './types.js';

const context = (): ToolUseContext => ({
  getAppState: () => getDefaultAppState(),
  setAppState: () => {},
  permissionContext: { mode: 'yolo', deniedTools: [] },
  abortController: new AbortController(),
});

beforeEach(() => mockFs.clear());

describe('FileReadTool', () => {
  it('should read existing file', async () => {
    mockFs.set('/tmp/test.txt', 'hello world');
    const result = await executeTool(FileReadTool, { path: '/tmp/test.txt' }, context());
    expect(result).toBe('hello world');
  });

  it('should throw on missing file', async () => {
    await expect(executeTool(FileReadTool, { path: '/missing' }, context())).rejects.toThrow('File not found');
  });

  it('should be read-only', () => {
    expect(FileReadTool.isReadOnly()).toBe(true);
  });
});

describe('FileEditTool', () => {
  it('should replace text in file', async () => {
    mockFs.set('/tmp/test.txt', 'hello world');
    const result = await executeTool(FileEditTool, { path: '/tmp/test.txt', oldText: 'world', newText: 'universe' }, context());
    expect(result).toBe('hello universe');
    expect(mockFs.get('/tmp/test.txt')).toBe('hello universe');
  });

  it('should throw when oldText not found', async () => {
    mockFs.set('/tmp/test.txt', 'hello world');
    await expect(
      executeTool(FileEditTool, { path: '/tmp/test.txt', oldText: 'missing', newText: 'x' }, context()),
    ).rejects.toThrow('oldText not found');
  });
});
