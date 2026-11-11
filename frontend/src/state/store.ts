export type Listener<T> = (state: T) => void;
export type Unsubscribe = () => void;

export interface Store<T> {
  getState: () => Readonly<T>;
  setState: (updater: Partial<T> | ((currentState: T) => Partial<T>)) => void;
  subscribe: (listener: Listener<T>) => Unsubscribe;
}

export function createStore<T extends Record<string, any>>(initialState: T): Store<T> {
  let state: T = { ...initialState };
  const listeners = new Set<Listener<T>>();

  const getState = (): Readonly<T> => ({ ...state });

  const setState = (updater: Partial<T> | ((currentState: T) => Partial<T>)) => {
    const nextPartial = typeof updater === 'function' ? updater(state) : updater;
    state = { ...state, ...nextPartial };
    listeners.forEach((listener) => listener(getState()));
  };

  const subscribe = (listener: Listener<T>): Unsubscribe => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return {
    getState,
    setState,
    subscribe,
  };
}
