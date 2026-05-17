import { describe, it, expect } from 'vitest'
import { AgentTool } from '@/03-tools/agent.js'
import type { ToolUseContext } from '@/03-tools/types.js'
import { getDefaultAppState } from '@/00-core/types.js'

function makeCtx(): ToolUseContext {
  const state = getDefaultAppState()
  return {
    getAppState: () => state,
    setAppState: (u) => {
      const next = u(state)
      Object.assign(state, next)
    },
    permissionContext: { mode: 'yolo', deniedTools: [] },
    abortController: new AbortController(),
  }
}

describe('03-tools/agent', () => {
  it('isDestructive = false', () => {
    expect(AgentTool.isDestructive()).toBe(false)
  })

  it('registers local_agent task in AppState', async () => {
    const ctx = makeCtx()
    await AgentTool.call({ prompt: 'Explore the codebase' }, ctx)
    const tasks = Object.values(ctx.getAppState().tasks)
    expect(tasks.length).toBeGreaterThanOrEqual(1)

    const task = tasks[0]
    expect(task.type).toBe('local_agent')
    expect(task.description).toBe('Explore the codebase')
  })

  it('sets task to completed after execution', async () => {
    const ctx = makeCtx()
    const result = await AgentTool.call({ prompt: 'Do something' }, ctx)
    expect(result).toContain('completed')

    const tasks = Object.values(ctx.getAppState().tasks)
    const task = tasks[0]
    expect(task.status).toBe('completed')
    expect(task.endTime).toBeDefined()
  })

  it('truncates long prompt in description (50 chars)', async () => {
    const ctx = makeCtx()
    const longPrompt = 'A'.repeat(100)
    await AgentTool.call({ prompt: longPrompt }, ctx)
    const task = Object.values(ctx.getAppState().tasks)[0]
    expect(task.description.length).toBeLessThanOrEqual(50)
  })

  it('records allowed tools in task output', async () => {
    const ctx = makeCtx()
    await AgentTool.call({ prompt: 'task', allowedTools: ['Read', 'Grep'] }, ctx)
    const task = Object.values(ctx.getAppState().tasks)[0]
    expect(task.output).toEqual(
      expect.arrayContaining([expect.stringContaining('Read, Grep')]),
    )
  })

  it('shows "all" when no allowedTools specified', async () => {
    const ctx = makeCtx()
    await AgentTool.call({ prompt: 'task' }, ctx)
    const task = Object.values(ctx.getAppState().tasks)[0]
    expect(task.output[0]).toContain('all')
  })

  it('returns agent task ID in result string', async () => {
    const ctx = makeCtx()
    const result = await AgentTool.call({ prompt: 'test' }, ctx)
    expect(result).toMatch(/^Agent task agent-\d+ completed$/)
  })
})
