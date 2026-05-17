import { describe, it, expect, beforeEach } from 'vitest'
import { processSlashCommand } from '@/01-commands/slash.js'
import { registerCommand, clearCommands } from '@/01-commands/registry.js'
import type { Command, CommandContext } from '@/01-commands/types.js'

const ctx: CommandContext = { permissionContext: { mode: 'default', deniedTools: [] }, cwd: '/' }

describe('01-commands/slash', () => {
  beforeEach(() => clearCommands())

  it('returns null for non-slash input', async () => {
    expect(await processSlashCommand('hello world', ctx)).toBeNull()
  })

  it('returns null for empty string', async () => {
    expect(await processSlashCommand('', ctx)).toBeNull()
  })

  it('parses command name and args', async () => {
    registerCommand({ name: 'echo', description: '', type: 'local', call: async (args) => args.join(' ') })
    const result = await processSlashCommand('/echo hello world', ctx)
    expect(result).not.toBeNull()
    expect(result!.commandName).toBe('echo')
    expect(result!.args).toEqual(['hello', 'world'])
  })

  it('handles command with no args', async () => {
    registerCommand({ name: 'clear', description: '', type: 'local', call: async () => 'cleared' })
    const result = await processSlashCommand('/clear', ctx)
    expect(result!.commandName).toBe('clear')
    expect(result!.args).toEqual([])
  })

  it('throws for unknown command', async () => {
    await expect(processSlashCommand('/unknown', ctx)).rejects.toThrow('Unknown command: /unknown')
  })

  it('handles extra whitespace between command and args', async () => {
    registerCommand({ name: 'test', description: '', type: 'local', call: async (args) => args.join(',') })
    const result = await processSlashCommand('/test   a   b   c', ctx)
    expect(result!.args).toEqual(['a', 'b', 'c'])
  })

  it('resolves alias to actual command', async () => {
    const cmd: Command = {
      name: 'help', description: '', type: 'local',
      aliases: ['h'],
      call: async () => 'help text',
    }
    registerCommand(cmd)
    const result = await processSlashCommand('/h', ctx)
    expect(result!.commandName).toBe('help')
  })

  it('returns correct result type for local command', async () => {
    registerCommand({ name: 'x', description: '', type: 'local', call: async () => 'done' })
    const result = await processSlashCommand('/x', ctx)
    expect(result!.result.type).toBe('text')
    if (result!.result.type === 'text') {
      expect(result!.result.text).toBe('done')
    }
  })
})
