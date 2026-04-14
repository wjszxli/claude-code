/**
 * Vitest setup file for tests
 */
import { expect, afterEach, vi } from 'vitest'

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks()
})
