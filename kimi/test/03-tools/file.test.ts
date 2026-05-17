import { describe, it, expect, beforeEach } from 'vitest'
import { FileReadTool, FileEditTool, mockFs } from '@/03-tools/file.js'
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

describe('03-tools/file', () => {
  beforeEach(() => mockFs.clear())

  describe('FileReadTool', () => {
    it('isReadOnly = true', () => {
      expect(FileReadTool.isReadOnly()).toBe(true)
    })

    it('isDestructive = false (default)', () => {
      expect(FileReadTool.isDestructive()).toBe(false)
    })

    it('reads file content from mockFs', async () => {
      mockFs.set('/tmp/test.txt', 'hello world')
      const result = await FileReadTool.call({ path: '/tmp/test.txt' }, makeCtx())
      expect(result).toBe('hello world')
    })

    it('throws when file not found', async () => {
      await expect(
        FileReadTool.call({ path: '/nonexistent' }, makeCtx()),
      ).rejects.toThrow('File not found: /nonexistent')
    })

    it('returns empty string for empty file', async () => {
      mockFs.set('/tmp/empty.txt', '')
      const result = await FileReadTool.call({ path: '/tmp/empty.txt' }, makeCtx())
      expect(result).toBe('')
    })
  })

  describe('FileEditTool', () => {
    it('isDestructive = true', () => {
      expect(FileEditTool.isDestructive()).toBe(true)
    })

    it('edits file content by replacing oldText with newText', async () => {
      mockFs.set('/tmp/test.txt', 'hello old world')
      const result = await FileEditTool.call(
        { path: '/tmp/test.txt', oldText: 'old', newText: 'new' },
        makeCtx(),
      )
      expect(result).toBe('hello new world')
      expect(mockFs.get('/tmp/test.txt')).toBe('hello new world')
    })

    it('throws when file not found', async () => {
      await expect(
        FileEditTool.call({ path: '/nonexistent', oldText: 'a', newText: 'b' }, makeCtx()),
      ).rejects.toThrow('File not found: /nonexistent')
    })

    it('throws when oldText not found in file', async () => {
      mockFs.set('/tmp/test.txt', 'hello world')
      await expect(
        FileEditTool.call({ path: '/tmp/test.txt', oldText: 'missing', newText: 'b' }, makeCtx()),
      ).rejects.toThrow('oldText not found')
    })

    it('only replaces first occurrence', async () => {
      mockFs.set('/tmp/test.txt', 'aaa aaa aaa')
      const result = await FileEditTool.call(
        { path: '/tmp/test.txt', oldText: 'aaa', newText: 'bbb' },
        makeCtx(),
      )
      expect(result).toBe('bbb aaa aaa')
    })

    it('can replace with empty string (deletion)', async () => {
      mockFs.set('/tmp/test.txt', 'hello DELETE world')
      const result = await FileEditTool.call(
        { path: '/tmp/test.txt', oldText: 'DELETE ', newText: '' },
        makeCtx(),
      )
      expect(result).toBe('hello world')
    })

    it('can replace with longer string', async () => {
      mockFs.set('/tmp/test.txt', 'short')
      const result = await FileEditTool.call(
        { path: '/tmp/test.txt', oldText: 'short', newText: 'much longer replacement' },
        makeCtx(),
      )
      expect(result).toBe('much longer replacement')
    })

    it('no-op when oldText equals newText', async () => {
      mockFs.set('/tmp/test.txt', 'same')
      const result = await FileEditTool.call(
        { path: '/tmp/test.txt', oldText: 'same', newText: 'same' },
        makeCtx(),
      )
      expect(result).toBe('same')
      expect(mockFs.get('/tmp/test.txt')).toBe('same')
    })

    it('can insert text by replacing empty string at start', async () => {
      mockFs.set('/tmp/test.txt', 'world')
      const result = await FileEditTool.call(
        { path: '/tmp/test.txt', oldText: '', newText: 'hello ' },
        makeCtx(),
      )
      expect(result).toBe('hello world')
    })
  })
})
