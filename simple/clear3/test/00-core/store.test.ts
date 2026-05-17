import { describe, it, expect, vi } from 'vitest'
import { createStore } from '@/00-core/store.js'

describe('00-core/store', () => {
  describe('createStore', () => {
    it('returns initial state via getState', () => {
      const store = createStore({ count: 0 })
      expect(store.getState()).toEqual({ count: 0 })
    })

    it('setState applies updater and updates state', () => {
      const store = createStore({ count: 0 })
      store.setState((s) => ({ count: s.count + 1 }))
      expect(store.getState().count).toBe(1)
    })

    it('setState creates new reference (immutable)', () => {
      const store = createStore({ count: 0 })
      const before = store.getState()
      store.setState((s) => ({ count: s.count + 1 }))
      expect(store.getState()).not.toBe(before)
    })

    it('setState does NOT notify when reference unchanged (Object.is)', () => {
      const store = createStore({ count: 0 })
      const listener = vi.fn()
      store.subscribe(listener)

      // Return same reference → should not notify
      store.setState((s) => s)
      expect(listener).not.toHaveBeenCalled()
    })

    it('setState notifies when reference changed', () => {
      const store = createStore({ count: 0 })
      const listener = vi.fn()
      store.subscribe(listener)

      store.setState((s) => ({ count: s.count + 1 }))
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('subscribe returns unsubscribe function', () => {
      const store = createStore({ count: 0 })
      const listener = vi.fn()
      const unsub = store.subscribe(listener)

      store.setState((s) => ({ count: 1 }))
      expect(listener).toHaveBeenCalledTimes(1)

      unsub()
      store.setState((s) => ({ count: 2 }))
      expect(listener).toHaveBeenCalledTimes(1) // not called after unsub
    })

    it('supports multiple subscribers', () => {
      const store = createStore({ count: 0 })
      const l1 = vi.fn()
      const l2 = vi.fn()
      store.subscribe(l1)
      store.subscribe(l2)

      store.setState((s) => ({ count: 1 }))
      expect(l1).toHaveBeenCalledTimes(1)
      expect(l2).toHaveBeenCalledTimes(1)
    })

    it('one unsub does not affect other subscribers', () => {
      const store = createStore({ count: 0 })
      const l1 = vi.fn()
      const l2 = vi.fn()
      const unsub1 = store.subscribe(l1)
      store.subscribe(l2)

      unsub1()
      store.setState((s) => ({ count: 1 }))
      expect(l1).toHaveBeenCalledTimes(0)
      expect(l2).toHaveBeenCalledTimes(1)
    })

    it('getState always returns latest state', () => {
      const store = createStore({ items: [] as string[] })
      store.setState((s) => ({ items: [...s.items, 'a'] }))
      store.setState((s) => ({ items: [...s.items, 'b'] }))

      expect(store.getState().items).toEqual(['a', 'b'])
    })

    it('works with complex state objects', () => {
      interface State { nested: { value: number } }
      const store = createStore<State>({ nested: { value: 42 } })
      store.setState((s) => ({ nested: { value: s.nested.value + 8 } }))
      expect(store.getState().nested.value).toBe(50)
    })
  })
})
