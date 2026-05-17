/**
 * Task 管理器测试
 * 对应原项目：tasks/ 目录下的测试
 */

import { describe, it, expect } from 'vitest'
import { TaskManager } from './manager.js'
import { createMockTask } from './mock-task.js'

describe('TaskManager', () => {
  it('should create a task manager', () => {
    const manager = new TaskManager()
    expect(manager.getTaskCount()).toBe(0)
  })

  it('should add a task', () => {
    const manager = new TaskManager()
    const task = createMockTask({ type: 'local_bash', description: 'Test task' })
    
    manager.addTask(task)
    expect(manager.getTaskCount()).toBe(1)
    expect(manager.getTask(task.id)).toBe(task)
  })

  it('should start a task', async () => {
    const manager = new TaskManager()
    const task = createMockTask({ type: 'local_agent', description: 'Agent task' })
    
    manager.addTask(task)
    await manager.startTask(task.id)
    
    expect(task.status).toBe('completed')
  })

  it('should kill a running task', async () => {
    const manager = new TaskManager()
    const task = createMockTask({ 
      type: 'workflow', 
      description: 'Long task',
      shouldRunLong: true 
    })
    
    manager.addTask(task)
    const startPromise = manager.startTask(task.id)
    
    // Give task time to start
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(task.status).toBe('running')
    
    await manager.killTask(task.id)
    expect(task.status).toBe('killed')
    
    await startPromise
  })

  it('should list tasks by type', () => {
    const manager = new TaskManager()
    const task1 = createMockTask({ type: 'local_bash' })
    const task2 = createMockTask({ type: 'local_bash' })
    const task3 = createMockTask({ type: 'local_agent' })
    
    manager.addTask(task1)
    manager.addTask(task2)
    manager.addTask(task3)
    
    const bashTasks = manager.getTasksByType('local_bash')
    expect(bashTasks).toHaveLength(2)
    
    const agentTasks = manager.getTasksByType('local_agent')
    expect(agentTasks).toHaveLength(1)
  })

  it('should remove completed tasks', async () => {
    const manager = new TaskManager()
    const task = createMockTask({ type: 'local_bash', description: 'Test' })
    
    manager.addTask(task)
    await manager.startTask(task.id)
    
    manager.cleanupCompletedTasks()
    expect(manager.getTaskCount()).toBe(0)
  })

  it('should emit task events', async () => {
    const manager = new TaskManager()
    const task = createMockTask({ type: 'local_bash' })
    const events: string[] = []
    
    manager.onTaskEvent((event) => events.push(event.type))
    
    manager.addTask(task)
    await manager.startTask(task.id)
    
    expect(events).toContain('started')
    expect(events).toContain('completed')
  })
})
