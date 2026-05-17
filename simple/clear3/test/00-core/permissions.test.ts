import { describe, it, expect } from 'vitest'
import { checkToolPermission } from '@/00-core/permissions.js'
import type { ToolPermissionContext } from '@/00-core/types.js'

describe('00-core/permissions', () => {
  function makeCtx(overrides?: Partial<ToolPermissionContext>): ToolPermissionContext {
    return { mode: 'default', deniedTools: [], ...overrides }
  }

  describe('deniedTools (最高优先级)', () => {
    it('denies tool in deniedTools list even in yolo mode', () => {
      const result = checkToolPermission('Bash', makeCtx({ mode: 'yolo', deniedTools: ['Bash'] }), true, false)
      expect(result.behavior).toBe('deny')
    })

    it('denies tool regardless of isReadOnly', () => {
      const result = checkToolPermission('Read', makeCtx({ mode: 'auto', deniedTools: ['Read'] }), false, true)
      expect(result.behavior).toBe('deny')
    })

    it('denies tool regardless of isDestructive', () => {
      const result = checkToolPermission('Write', makeCtx({ deniedTools: ['Write'] }), true, false)
      expect(result.behavior).toBe('deny')
    })

    it('does not deny tool not in list', () => {
      const result = checkToolPermission('Read', makeCtx({ deniedTools: ['Bash'] }), false, true)
      expect(result.behavior).not.toBe('deny')
    })

    it('handles empty deniedTools', () => {
      const result = checkToolPermission('Bash', makeCtx({ deniedTools: [] }), true, false)
      expect(result.behavior).not.toBe('deny')
    })
  })

  describe('yolo 模式', () => {
    it('allows destructive tools', () => {
      const result = checkToolPermission('Bash', makeCtx({ mode: 'yolo' }), true, false)
      expect(result.behavior).toBe('allow')
    })

    it('allows readonly tools', () => {
      const result = checkToolPermission('Read', makeCtx({ mode: 'yolo' }), false, true)
      expect(result.behavior).toBe('allow')
    })

    it('allows everything when no deny list', () => {
      const result = checkToolPermission('Write', makeCtx({ mode: 'yolo' }), true, false)
      expect(result.behavior).toBe('allow')
    })
  })

  describe('auto 模式', () => {
    it('asks for destructive tools', () => {
      const result = checkToolPermission('Bash', makeCtx({ mode: 'auto' }), true, false)
      expect(result.behavior).toBe('ask')
    })

    it('allows non-destructive tools', () => {
      const result = checkToolPermission('Read', makeCtx({ mode: 'auto' }), false, false)
      expect(result.behavior).toBe('allow')
    })

    it('allows readonly tools', () => {
      const result = checkToolPermission('Grep', makeCtx({ mode: 'auto' }), false, true)
      expect(result.behavior).toBe('allow')
    })

    it('asks for destructive even if readonly', () => {
      // 工具可能同时标记 destructive + readonly（边界情况）
      const result = checkToolPermission('X', makeCtx({ mode: 'auto' }), true, true)
      expect(result.behavior).toBe('ask')
    })
  })

  describe('plan 模式', () => {
    it('allows readonly tools', () => {
      const result = checkToolPermission('Read', makeCtx({ mode: 'plan' }), false, true)
      expect(result.behavior).toBe('allow')
    })

    it('asks for non-readonly tools', () => {
      const result = checkToolPermission('Bash', makeCtx({ mode: 'plan' }), true, false)
      expect(result.behavior).toBe('ask')
    })

    it('asks for destructive readonly tools (non-readonly wins)', () => {
      // isReadOnly=false 时即使非 destructive 也要 ask
      const result = checkToolPermission('Edit', makeCtx({ mode: 'plan' }), false, false)
      expect(result.behavior).toBe('ask')
    })
  })

  describe('default 模式', () => {
    it('asks for destructive tools', () => {
      const result = checkToolPermission('Bash', makeCtx({ mode: 'default' }), true, false)
      expect(result.behavior).toBe('ask')
    })

    it('allows non-destructive tools', () => {
      const result = checkToolPermission('Read', makeCtx({ mode: 'default' }), false, false)
      expect(result.behavior).toBe('allow')
    })

    it('allows readonly tools', () => {
      const result = checkToolPermission('Grep', makeCtx({ mode: 'default' }), false, true)
      expect(result.behavior).toBe('allow')
    })
  })

  describe('边界情况', () => {
    it('falls to default for unknown mode', () => {
      // @ts-expect-error — testing unknown mode
      const result = checkToolPermission('Read', makeCtx({ mode: 'unknown' }), false, false)
      expect(result.behavior).toBe('allow')
    })

    it('multiple denied tools', () => {
      const ctx = makeCtx({ mode: 'yolo', deniedTools: ['Bash', 'Write', 'Edit'] })
      expect(checkToolPermission('Bash', ctx, true, false).behavior).toBe('deny')
      expect(checkToolPermission('Write', ctx, true, false).behavior).toBe('deny')
      expect(checkToolPermission('Read', ctx, false, true).behavior).toBe('allow')
    })
  })
})
