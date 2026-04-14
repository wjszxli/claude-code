import { describe, it, expect, beforeEach } from 'vitest';
import { registerCommand, findCommand, getAllCommands, executeCommand, clearCommands } from './index.js';
import type { Command, CommandContext } from './types.js';

const ctx = (): CommandContext => ({ permissionContext: { mode: 'default', deniedTools: [] }, cwd: '/' });

describe('Command Registry', () => {
  beforeEach(() => clearCommands());

  it('should register and find command', () => {
    const cmd: Command = { name: 'help', description: 'help', type: 'local', call: async () => 'help text' };
    registerCommand(cmd);
    expect(findCommand('help')?.name).toBe('help');
  });

  it('should find by alias', () => {
    const cmd: Command = { name: 'help', description: 'help', aliases: ['h'], type: 'local', call: async () => '' };
    registerCommand(cmd);
    expect(findCommand('h')?.name).toBe('help');
  });

  it('should filter disabled commands', () => {
    const enabled: Command = { name: 'a', description: 'a', type: 'local', call: async () => '' };
    const disabled: Command = { name: 'b', description: 'b', type: 'local', isEnabled: () => false, call: async () => '' };
    registerCommand(enabled);
    registerCommand(disabled);
    expect(getAllCommands()).toHaveLength(1);
  });
});

describe('executeCommand', () => {
  beforeEach(() => clearCommands());

  it('should execute local command', async () => {
    const cmd: Command = { name: 'echo', description: 'echo', type: 'local', call: async (args) => args.join(' ') };
    const result = await executeCommand(cmd, ['hello', 'world'], ctx());
    expect(result).toEqual({ type: 'text', text: 'hello world' });
  });

  it('should execute local-jsx command', async () => {
    const cmd: Command = { name: 'config', description: 'config', type: 'local-jsx', call: (onDone) => onDone('saved') };
    const result = await executeCommand(cmd, [], ctx());
    expect(result.type).toBe('jsx');
    if (result.type === 'jsx') expect(await result.promise).toBe('saved');
  });

  it('should execute inline prompt command', async () => {
    const cmd: Command = {
      name: 'skill',
      description: 'skill',
      type: 'prompt',
      context: 'inline',
      getPromptForCommand: async (args) => `Run skill: ${args.join(' ')}`,
    };
    const result = await executeCommand(cmd, ['test'], ctx());
    expect(result.type).toBe('messages');
    if (result.type === 'messages') {
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toBe('Run skill: test');
    }
  });

  it('should execute fork prompt command', async () => {
    const cmd: Command = {
      name: 'agent',
      description: 'agent',
      type: 'prompt',
      context: 'fork',
      allowedTools: ['file_read'],
      getPromptForCommand: async () => 'Analyze this',
    };
    const result = await executeCommand(cmd, [], ctx());
    expect(result.type).toBe('messages');
    if (result.type === 'messages') {
      expect(result.messages).toHaveLength(2);
      expect(result.messages[1].content).toContain('Forked to sub-agent');
    }
  });
});
