import { describe, it, expect, beforeEach } from 'vitest'
import { registerCommand, findCommand, getAllCommands, executeCommand, clearCommands } from '@/01-commands/registry.js'
import type { Command, CommandContext } from '@/01-commands/types.js'

const ctx: CommandContext = { permissionContext: { mode: 'default', deniedTools: [] }, cwd: '/' }

describe('01-commands/registry', () => {
  beforeEach(() => clearCommands())

  describe('registerCommand + findCommand', () => {
    it('registers and finds a local command', () => {
      const cmd: Command = {
        name: 'clear', description: 'Clear screen', type: 'local',
        call: async () => 'cleared',
      }
      registerCommand(cmd)
      expect(findCommand('clear')).toBe(cmd)
    })

    it('returns undefined for unknown command', () => {
      expect(findCommand('nonexistent')).toBeUndefined()
    })

    it('registers aliases', () => {
      const cmd: Command = {
        name: 'help', description: 'Show help', type: 'local',
        aliases: ['h', '?'],
        call: async () => 'help text',
      }
      registerCommand(cmd)
      expect(findCommand('help')).toBe(cmd)
      expect(findCommand('h')).toBe(cmd)
      expect(findCommand('?')).toBe(cmd)
    })

    it('overwrites command with same name', () => {
      const cmd1: Command = { name: 'x', description: 'first', type: 'local', call: async () => '1' }
      const cmd2: Command = { name: 'x', description: 'second', type: 'local', call: async () => '2' }
      registerCommand(cmd1)
      registerCommand(cmd2)
      expect(findCommand('x')!.description).toBe('second')
    })
  })

  describe('getAllCommands', () => {
    it('returns all registered commands (deduplicated)', () => {
      registerCommand({ name: 'a', description: 'A', type: 'local', call: async () => '', aliases: ['alias-a'] })
      registerCommand({ name: 'b', description: 'B', type: 'local', call: async () => '' })
      const all = getAllCommands()
      const names = all.map((c) => c.name)
      expect(names).toContain('a')
      expect(names).toContain('b')
      expect(names).toHaveLength(2) // aliases not counted
    })

    it('filters out disabled commands', () => {
      registerCommand({ name: 'enabled', description: 'E', type: 'local', call: async () => '' })
      registerCommand({ name: 'disabled', description: 'D', type: 'local', call: async () => '', isEnabled: () => false })
      const all = getAllCommands()
      expect(all.map((c) => c.name)).toEqual(['enabled'])
    })

    it('returns empty when no commands registered', () => {
      expect(getAllCommands()).toEqual([])
    })

    it('treats isEnabled returning undefined as enabled', () => {
      registerCommand({ name: 'enabled', description: 'E', type: 'local', call: async () => '', isEnabled: () => undefined as any })
      expect(getAllCommands()).toHaveLength(1)
    })
  })

  describe('executeCommand', () => {
    it('executes local command and returns text result', async () => {
      const cmd: Command = { name: 'echo', description: '', type: 'local', call: async (args) => args.join(' ') }
      const result = await executeCommand(cmd, ['hello', 'world'], ctx)
      expect(result).toEqual({ type: 'text', text: 'hello world' })
    })

    it('executes local-jsx command and returns jsx result', async () => {
      const cmd: Command = {
        name: 'picker', description: '', type: 'local-jsx',
        call: (resolve, args) => resolve(`picked: ${args[0]}`),
      }
      const result = await executeCommand(cmd, ['item'], ctx)
      expect(result.type).toBe('jsx')
      if (result.type === 'jsx') {
        const text = await result.promise
        expect(text).toBe('picked: item')
      }
    })

    it('executes prompt inline command and returns messages', async () => {
      const cmd: Command = {
        name: 'review', description: '', type: 'prompt',
        context: 'inline',
        getPromptForCommand: async (args) => `Review: ${args.join(' ')}`,
      }
      const result = await executeCommand(cmd, ['src/main.ts'], ctx)
      expect(result.type).toBe('messages')
      if (result.type === 'messages') {
        expect(result.messages[0].content).toBe('Review: src/main.ts')
        expect(result.messages[0].source).toBe('system')
      }
    })

    it('prompt fork command injects fork message', async () => {
      const cmd: Command = {
        name: 'plan', description: '', type: 'prompt',
        context: 'fork',
        allowedTools: ['Read', 'Grep'],
        getPromptForCommand: async () => 'Plan this',
      }
      const result = await executeCommand(cmd, [], ctx)
      expect(result.type).toBe('messages')
      if (result.type === 'messages') {
        expect(result.messages).toHaveLength(2)
        expect(result.messages[1].content).toContain('Forked to sub-agent')
        expect(result.messages[1].content).toContain('Read, Grep')
      }
    })

    it('prompt fork without allowedTools defaults to all', async () => {
      const cmd: Command = {
        name: 'plan2', description: '', type: 'prompt',
        context: 'fork',
        getPromptForCommand: async () => 'Plan',
      }
      const result = await executeCommand(cmd, [], ctx)
      if (result.type === 'messages') {
        expect(result.messages[1].content).toContain('all')
      }
    })
  })

  describe('clearCommands', () => {
    it('clears all registered commands', () => {
      registerCommand({ name: 'x', description: '', type: 'local', call: async () => '' })
      clearCommands()
      expect(findCommand('x')).toBeUndefined()
      expect(getAllCommands()).toEqual([])
    })
  })
})
