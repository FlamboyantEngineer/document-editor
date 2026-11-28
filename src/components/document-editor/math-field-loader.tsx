// The field that edits math in place loads the first time it is needed, with the code editor it is
// built on, not with the editor (DOCE-ENTRY-2.2), and is then kept: every later edit renders it at
// once, in the same commit as the edit, so keys typed straight after starting an edit reach it.
// A load that fails is tried again the next time.

import { type ComponentProps, useEffect, useEffectEvent, useSyncExternalStore } from 'react';
import { SURFACE_LOADERS } from './lazy-surfaces.js';

type MathFieldComponent = Awaited<ReturnType<(typeof SURFACE_LOADERS)['math']>>['MathField'];

let loaded: MathFieldComponent | null = null;
let loading: Promise<MathFieldComponent> | null = null;
const listeners = new Set<() => void>();

/** Loads the field, once; after a failed load the next call loads it again. */
export function loadMathField(): Promise<MathFieldComponent> {
  loading ??= SURFACE_LOADERS.math().then(
    ({ MathField }) => {
      loaded = MathField;
      for (const listener of listeners) listener();
      return MathField;
    },
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const isLoaded = () => loaded !== null;

/**
 * Whether the field has loaded: while `needed` and it has not, it is loaded, and `failed` is told
 * when the load fails.
 */
export function useMathFieldLoaded(needed: boolean, failed: () => void): boolean {
  const ready = useSyncExternalStore(subscribe, isLoaded, isLoaded);
  const onFailed = useEffectEvent(failed);
  useEffect(() => {
    if (ready || !needed) return;
    let live = true;
    loadMathField().catch(() => {
      if (live) onFailed();
    });
    return () => {
      live = false;
    };
  }, [ready, needed]);
  return ready;
}

/** The loaded field, or nothing before it has loaded. */
export function LoadedMathField(props: ComponentProps<MathFieldComponent>) {
  const Field = loaded;
  return Field ? <Field {...props} /> : null;
}
