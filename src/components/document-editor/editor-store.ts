// The editor context as a store a component reads a part of, so it draws again only when that part
// changes rather than on every state the editor shows (`useDocumentEditorState`).

import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { EditorContext } from './editor-context.js';

/** The editor context the editor shows last, with a way to hear when it changes. */
export interface EditorStore {
  get(): EditorContext | null;
  subscribe(listener: () => void): () => void;
}

interface OwnedEditorStore extends EditorStore {
  set(context: EditorContext): void;
}

function createEditorStore(): OwnedEditorStore {
  let current: EditorContext | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(context) {
      if (context === current) return;
      current = context;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const DocumentEditorStoreContext = createContext<EditorStore | null>(null);

/** A store the editor keeps at the context it shows, for the components inside it. */
export function useEditorStore(context: EditorContext): EditorStore {
  const [store] = useState(createEditorStore);
  useLayoutEffect(() => store.set(context), [store, context]);
  return store;
}

const NO_STORE = (): (() => void) => () => undefined;

interface Selected<T> {
  readonly context: EditorContext | null;
  readonly value: T | null;
}

/**
 * A part of the editor holding the calling component, as `selector` reads it from the editor
 * context, such as whether a mark holds at the selection (`isActive`). The component draws again
 * only when the part changes, by `isEqual` (by default `Object.is`), not on every state the editor
 * shows. Null outside an editor. `selector` is read again when the editor's context changes.
 */
export function useDocumentEditorState<T>(
  selector: (editor: EditorContext) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T | null {
  const store = useContext(DocumentEditorStoreContext);
  const last = useRef<Selected<T> | null>(null);
  const read = (): T | null => {
    const context = store?.get() ?? null;
    const before = last.current;
    if (before && before.context === context) return before.value;
    const value = context ? selector(context) : null;
    const kept =
      before && before.value !== null && value !== null && isEqual(before.value, value)
        ? before.value
        : value;
    last.current = { context, value: kept };
    return kept;
  };
  return useSyncExternalStore(store?.subscribe ?? NO_STORE, read, read);
}
