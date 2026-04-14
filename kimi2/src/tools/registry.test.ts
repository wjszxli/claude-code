import { describe, it, expect, beforeEach } from 'vitest';
import { registerTool, getTool, getAllTools, getToolsForContext, clearRegistry } from './registry.js';
import { buildTool } from './index.js';

describe('Tool Registry', () => {
  beforeEach(() => clearRegistry());

  it('should register and retrieve a tool', () => {
    const tool = buildTool({ name: 'echo', description: 'echo', inputSchema: {}, call: async () => '' });
    registerTool(tool);
    expect(getTool('echo')?.name).toBe('echo');
  });

  it('should return undefined for missing tool', () => {
    expect(getTool('missing')).toBeUndefined();
  });

  it('should list enabled tools only', () => {
    const enabled = buildTool({ name: 'a', description: 'a', inputSchema: {}, call: async () => '' });
    const disabled = buildTool({ name: 'b', description: 'b', inputSchema: {}, call: async () => '', isEnabled: () => false });
    registerTool(enabled);
    registerTool(disabled);
    const all = getAllTools();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('a');
  });

  it('should filter out denied tools for context', () => {
    const a = buildTool({ name: 'a', description: 'a', inputSchema: {}, call: async () => '' });
    const b = buildTool({ name: 'b', description: 'b', inputSchema: {}, call: async () => '' });
    registerTool(a);
    registerTool(b);
    const ctx = { mode: 'default' as const, deniedTools: ['b'] };
    expect(getToolsForContext(ctx)).toHaveLength(1);
  });
});
