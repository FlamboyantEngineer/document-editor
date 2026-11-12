// A value that changes, with its listeners: the shape of every store a session gives.

/** A value now, and its changes. */
export interface ValueStore<T> {
  get(): T;
  /** Calls `listener` whenever the value changes, until the returned function is called. */
  subscribe(listener: (value: T) => void): () => void;
}

/** A store a session writes: `set` replaces the value and tells the listeners when it changed. */
export interface WritableStore<T> extends ValueStore<T> {
  set(value: T): void;
}

/** A store that starts at `initial`; a listener that throws does not stop the others. */
export function createValueStore<T>(
  initial: T,
  onListenerError: (error: unknown) => void = (error) =>
    queueMicrotask(() => {
      throw error;
    }),
): WritableStore<T> {
  let value = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of [...listeners]) {
        try {
          listener(value);
        } catch (error) {
          onListenerError(error);
        }
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
