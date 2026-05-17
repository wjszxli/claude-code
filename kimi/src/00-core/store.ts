/**
 * 极简订阅式 Store
 * ============================================================================
 * 设计思想：
 * 原项目没有使用 Redux / Zustand，而是自研了一个不到 40 行的 createStore。
 * 核心原则是：
 * 1. 不可变更新 —— setState 接收 (state) => nextState，旧状态绝不修改。
 * 2. 引用相等优化 —— 如果 updater 返回的引用不变，不触发订阅者，避免无效渲染。
 * 3. 去中心化订阅 —— 任何模块都可以 subscribe，但没有任何一个模块能直接拿到
 *    setter 去随意修改不相关的状态。
 * ============================================================================
 */

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
