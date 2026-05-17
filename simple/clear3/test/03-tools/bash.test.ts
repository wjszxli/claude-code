import { describe, it, expect, beforeEach } from 'vitest'
import { BashTool, mockShell } from '@/03-tools/bash.js'
import type { ToolUseContext } from '@/03-tools/types.js'
import { getDefaultAppState } from '@/00-core/types.js'

function makeCtx(): ToolUseContext {
  const state = getDefaultAppState()
  return {
    getAppState: () => state,
    setAppState: (u) => { Object.assign(state, u(state)) },
    permissionContext: { mode: 'yolo', deniedTools: [] },
    abortController: new AbortController(),
  }
}

describe('03-tools/bash', () => {
  beforeEach(() => mockShell.clear())

  it('isDestructive = true', () => {
    expect(BashTool.isDestructive()).toBe(true)
  })

  it('registers task in AppState on call', async () => {
    const ctx = makeCtx()
    await BashTool.call({ command: 'ls' }, ctx)
    const tasks = ctx.getAppState().tasks
    const taskIds = Object.keys(tasks)
    expect(taskIds.length).toBeGreaterThanOrEqual(1)

    const task = Object.values(tasks)[0]
    expect(task.type).toBe('local_bash')
    expect(task.description).toBe('ls')
  })

  it('uses mockShell when command is preset', async () => {
    mockShell.set('git status', { stdout: 'On branch main', stderr: '', exitCode: 0 })
    const ctx = makeCtx()
    const result = await BashTool.call({ command: 'git status' }, ctx)
    expect(result.stdout).toBe('On branch main')
    expect(result.exitCode).toBe(0)
  })

  it('uses default output when command not in mockShell', async () => {
    const ctx = makeCtx()
    const result = await BashTool.call({ command: 'npm test' }, ctx)
    expect(result.stdout).toContain('Executed: npm test')
    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
  })

  it('marks task as completed after execution', async () => {
    const ctx = makeCtx()
    await BashTool.call({ command: 'echo hello' }, ctx)
    const tasks = Object.values(ctx.getAppState().tasks)
    // Last registered task should be completed
    const lastTask = tasks[tasks.length - 1]
    expect(lastTask.status).toBe('completed')
    expect(lastTask.endTime).toBeDefined()
  })

  it('registers different task IDs for different calls', async () => {
    const ctx = makeCtx()
    await BashTool.call({ command: 'cmd1' }, ctx)
    await BashTool.call({ command: 'cmd2' }, ctx)
    const taskIds = Object.keys(ctx.getAppState().tasks)
    expect(taskIds).toHaveLength(2)
    expect(new Set(taskIds).size).toBe(2) // all unique
  })

  it('returns non-zero exit code and stderr from mockShell', async () => {
    mockShell.set('fail', { stdout: '', stderr: 'permission denied', exitCode: 1 })
    const ctx = makeCtx()
    const result = await BashTool.call({ command: 'fail' }, ctx)
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toBe('permission denied')
  })

  it('handles empty command string', async () => {
    const ctx = makeCtx()
    const result = await BashTool.call({ command: '' }, ctx)
    expect(result.stdout).toContain('Executed:')
  })
})
