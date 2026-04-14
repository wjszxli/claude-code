/**
 * Core Types Tests
 * 验证核心类型系统的运行时行为
 */

import { describe, it, expect } from 'vitest'
import { isTerminalStatus } from '../../core/types.js'

describe('core/types', () => {
  describe('isTerminalStatus', () => {
    it('pending is not terminal', () => {
      expect(isTerminalStatus('pending')).toBe(false)
    })

    it('running is not terminal', () => {
      expect(isTerminalStatus('running')).toBe(false)
    })

    it('completed is terminal', () => {
      expect(isTerminalStatus('completed')).toBe(true)
    })

    it('failed is terminal', () => {
      expect(isTerminalStatus('failed')).toBe(true)
    })

    it('killed is terminal', () => {
      expect(isTerminalStatus('killed')).toBe(true)
    })
  })
})
