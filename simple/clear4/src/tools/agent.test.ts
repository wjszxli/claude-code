import { describe, it, expect, beforeEach } from 'vitest';
import { AgentTool } from './agent.js';
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

beforeEach(() => { state = getDefaultAppState(); });

describe('AgentTool', () => {
  it('should create a local agent task', async () => {
    const result = await executeTool(AgentTool, { prompt: 'Analyze codebase', allowedTools: ['file_read'] }, context());
    expect(result).toMatch(/Agent task agent-\d+ completed/);
    const tasks = Object.values(state.tasks);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].type).toBe('local_agent');
    expect(tasks[0].status).toBe('completed');
  });
});
