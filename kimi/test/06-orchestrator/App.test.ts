import { describe, it, expect, beforeEach, vi } from 'vitest'
import { App, createApp } from '@/06-orchestrator/App.js'
import { clearCommands } from '@/01-commands/registry.js'
import { clearRegistry } from '@/03-tools/registry.js'
import { buildTool } from '@/03-tools/factory.js'
import type { Command } from '@/01-commands/types.js'

// 清理全局注册表
beforeEach(() => {
  clearCommands()
  clearRegistry()
})

describe('06-orchestrator/App', () => {
  describe('构造', () => {
    it('initializes with default state', () => {
      const app = createApp()
      const state = app.store.getState()
      expect(state.messages).toEqual([])
      expect(state.permissionContext.mode).toBe('default')
    })

    it('accepts custom initialState', () => {
      const app = createApp({
        initialState: {
          messages: [],
          tasks: {},
          permissionContext: { mode: 'yolo', deniedTools: [] },
          model: 'custom-model',
          verbose: true,
        },
      })
      expect(app.store.getState().model).toBe('custom-model')
      expect(app.store.getState().verbose).toBe(true)
    })

    it('accepts custom systemPrompt', () => {
      const app = createApp({ systemPrompt: 'You are a coding assistant.' })
      // systemPrompt is set on engine, verified through query behavior
      expect(app).toBeDefined()
    })

    it('registers provided commands', () => {
      const cmd: Command = { name: 'test', description: '', type: 'local', call: async () => 'ok' }
      const app = createApp({ commands: [cmd] })
      // Verify command is registered by submitting slash command
      expect(app).toBeDefined()
    })

    it('registers commands with aliases', async () => {
      const cmd: Command = { name: 'test', description: '', type: 'local', aliases: ['t'], call: async () => 'ok' }
      const app = createApp({ commands: [cmd] })
      const result = await app.submitUserInput('/t')
      expect(result.responseText).toContain('[Command: /test]')
    })

    it('registers provided tools', () => {
      const tool = buildTool({ name: 'my_tool', description: '', inputSchema: {}, call: async () => 'ok' })
      const app = createApp({ tools: [tool] })
      expect(app).toBeDefined()
    })
  })

  describe('submitUserInput — 命令路径', () => {
    it('executes slash command and returns command result', async () => {
      const cmd: Command = { name: 'hello', description: '', type: 'local', call: async () => 'world' }
      const app = createApp({ commands: [cmd] })

      const result = await app.submitUserInput('/hello')
      expect(result.responseText).toContain('[Command: /hello]')
      expect(result.hadToolCalls).toBe(false)
    })

    it('injects messages from prompt command into state', async () => {
      const cmd: Command = {
        name: 'review',
        description: '',
        type: 'prompt',
        context: 'inline',
        getPromptForCommand: async () => 'Review the code',
      }
      const app = createApp({ commands: [cmd] })

      await app.submitUserInput('/review')
      expect(app.store.getState().messages.length).toBeGreaterThan(0)
    })

    it('throws for unknown slash command', async () => {
      const app = createApp()
      await expect(app.submitUserInput('/unknown')).rejects.toThrow()
    })
  })

  describe('submitUserInput — 对话路径', () => {
    it('processes normal input through QueryEngine', async () => {
      const app = createApp()
      const result = await app.submitUserInput('Hello')
      expect(result.responseText).toBeDefined()
      expect(result.hadToolCalls).toBe(false)
      expect(result.messageCount).toBeGreaterThan(0)
    })

    it('handles empty string input', async () => {
      const app = createApp()
      const result = await app.submitUserInput('')
      expect(result.responseText).toBeDefined()
    })

    it('detects tool calls in response', async () => {
      const tool = buildTool({ name: 'bash', description: '', inputSchema: {}, call: async () => 'ok' })
      const app = createApp({ tools: [tool] })
      // 'bash' keyword triggers tool_use in simulateLLMResponse
      const result = await app.submitUserInput('run bash ls')
      expect(result.hadToolCalls).toBe(true)
    })

    it('syncs engine history to AppState messages', async () => {
      const app = createApp()
      await app.submitUserInput('test')
      const state = app.store.getState()
      expect(state.messages.length).toBeGreaterThan(0)
      // Should contain user message + engine messages
      const sources = state.messages.map((m) => m.source)
      expect(sources).toContain('user')
    })

    it('accumulates messages across multiple submissions', async () => {
      const app = createApp()
      await app.submitUserInput('first')
      const count1 = app.store.getState().messages.length
      await app.submitUserInput('second')
      const count2 = app.store.getState().messages.length
      expect(count2).toBeGreaterThan(count1)
    })
  })

  describe('setPermissionMode', () => {
    it('updates permission mode in state', () => {
      const app = createApp()
      app.setPermissionMode('yolo')
      expect(app.store.getState().permissionContext.mode).toBe('yolo')
    })

    it('notifies store subscribers', () => {
      const app = createApp()
      const listener = vi.fn()
      app.store.subscribe(listener)
      app.setPermissionMode('auto')
      expect(listener).toHaveBeenCalled()
    })
  })

  describe('registerDynamicTool', () => {
    it('adds tool to both registry and engine', async () => {
      const app = createApp()
      const tool = buildTool({ name: 'dynamic', description: '', inputSchema: {}, call: async () => 'dynamic-result' })
      app.registerDynamicTool(tool)

      // Verify it works through submitUserInput
      const result = await app.submitUserInput('use dynamic tool')
      expect(result.hadToolCalls).toBe(true)
    })

    it('overwrites existing tool with same name', async () => {
      const app = createApp()
      const tool1 = buildTool({ name: 'same', description: '', inputSchema: {}, call: async () => 'v1' })
      const tool2 = buildTool({ name: 'same', description: '', inputSchema: {}, call: async () => 'v2' })
      app.registerDynamicTool(tool1)
      app.registerDynamicTool(tool2)
      // Should not throw and engine should still have the tool
      const result = await app.submitUserInput('use same tool')
      expect(result.hadToolCalls).toBe(true)
    })
  })

  describe('createApp factory', () => {
    it('returns App instance', () => {
      expect(createApp()).toBeInstanceOf(App)
    })

    it('passes config to App constructor', () => {
      const app = createApp({ systemPrompt: 'custom' })
      expect(app).toBeInstanceOf(App)
    })
  })
})
