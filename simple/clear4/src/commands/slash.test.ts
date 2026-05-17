import { describe, it, expect, beforeEach } from 'vitest';
import { processSlashCommand } from './slash.js';
import { registerCommand, clearCommands } from './index.js';
import type { Command, CommandContext } from './types.js';

const ctx = (): CommandContext => ({ permissionContext: { mode: 'default', deniedTools: [] }, cwd: '/' });

describe('processSlashCommand', () => {
  beforeEach(() => clearCommands());

  it('should return null for non-slash input', async () => {
    const result = await processSlashCommand('hello world', ctx());
    expect(result).toBeNull();
  });

  it('should throw on unknown command', async () => {
    await expect(processSlashCommand('/unknown', ctx())).rejects.toThrow('Unknown command');
  });

  it('should execute known command with args', async () => {
    const cmd: Command = { name: 'echo', description: 'echo', type: 'local', call: async (args) => args.join('-') };
    registerCommand(cmd);
    const result = await processSlashCommand('/echo a b c', ctx());
    expect(result?.commandName).toBe('echo');
    expect(result?.args).toEqual(['a', 'b', 'c']);
    expect(result?.result).toEqual({ type: 'text', text: 'a-b-c' });
  });
});
