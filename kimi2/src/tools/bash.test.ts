import { describe, it, expect, beforeEach } from 'vitest';
import { BashTool, mockShell } from './bash.js';
import { executeTool } from './index.js';
import { getDefaultAppState } from '../core/types.js';
import type { ToolUseContext } from './types.js';

let state = getDefaultAppState();
const context = (): ToolUseContext => ({
  getAppState: () => state,
  setAppState: (updater) => { state = updater(state); },
  permissionContext: { mode: 'yolo', deniedTools: [] },
  abortController: new AbortController(),
});

beforeEach(() => {
  state = getDefaultAppState();
  mockShell.clear();
});

describe('BashTool', () => {
  it('should execute mocked command', async () => {
    mockShell.set('ls', { stdout: 'a.txt\nb.txt', stderr: '', exitCode: 0 });
    const result = await executeTool(BashTool, { command: 'ls' }, context());
    expect(result.stdout).toBe('a.txt\nb.txt');
  });

  it('should register a shell task on fallback', async () => {
    const result = await executeTool(BashTool, { command: 'echo hi' }, context());
    expect(result.stdout).toBe('Executed: echo hi');
    const tasks = Object.values(state.tasks);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].type).toBe('local_bash');
    expect(tasks[0].status).toBe('completed');
  });

  it('should be destructive', () => {
    expect(BashTool.isDestructive()).toBe(true);
  });
});
