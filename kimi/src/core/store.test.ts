import { describe, it, expect, vi } from 'vitest';
import { createStore } from './store.js';

describe('createStore', () => {
  it('should return initial state', () => {
    const store = createStore({ count: 0 });
    expect(store.getState()).toEqual({ count: 0 });
  });

  it('should update state immutably', () => {
    const store = createStore({ count: 0 });
    store.setState((s) => ({ ...s, count: s.count + 1 }));
    expect(store.getState()).toEqual({ count: 1 });
  });

  it('should not notify listeners when state reference is unchanged', () => {
    const store = createStore({ count: 0 });
    const listener = vi.fn();
    store.subscribe(listener);
    store.setState((s) => s);
    expect(listener).not.toHaveBeenCalled();
  });

  it('should notify listeners on state change', () => {
    const store = createStore({ count: 0 });
    const listener = vi.fn();
    store.subscribe(listener);
    store.setState((s) => ({ ...s, count: 1 }));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should allow unsubscribe', () => {
    const store = createStore({ count: 0 });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.setState((s) => ({ ...s, count: 1 }));
    expect(listener).not.toHaveBeenCalled();
  });

  it('should support multiple listeners', () => {
    const store = createStore({ count: 0 });
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);
    store.setState((s) => ({ ...s, count: 5 }));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
