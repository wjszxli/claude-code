/**
 * 全局状态管理简化版
 * 对应原项目：state/store.ts, state/AppStateStore.ts, state/onChangeAppState.ts
 */

import type { AppState } from './types.js';

export type Listener = () => void;
export type Unsubscribe = () => void;

export interface Store<T> {
  getState(): T;
  setState(updater: (state: T) => T): void;
  subscribe(listener: Listener): Unsubscribe;
}

export function createStore<T>(initialState: T): Store<T> {
  let state = initialState;
  const listeners = new Set<Listener>();

  return {
    getState: () => state,
    setState: (updater) => {
      const nextState = updater(state);
      if (!Object.is(state, nextState)) {
        state = nextState;
        listeners.forEach((listener) => listener());
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
