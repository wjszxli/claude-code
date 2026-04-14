import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 10000,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      'src': path.resolve(__dirname, 'src'),
      'bun:bundle': path.resolve(__dirname, 'vitest.mocks/bunBundle.ts'),
    },
  },
  optimizeDeps: {
    exclude: ['bun:bundle'],
  },
})
