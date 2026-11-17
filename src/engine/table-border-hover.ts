// What the row and column resizes share: the border under the pointer, which a scroll away from it
// forgets, and the cells a host's lock keeps the writer from resizing or selecting.

import type { EditorState, PluginKey, PluginView } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { editLockKey } from './edit-lock.js';

/** The cell whose border the pointer is on, or -1, and whether it is being dragged. */
export interface BorderState {
  readonly handle: number;
  readonly dragging: boolean;
}

/** No border under the pointer. */
export const NO_BORDER: BorderState = { handle: -1, dragging: false };

/** Whether a host's lock keeps the writer from changing the cell at a position before it. */
export function isCellLocked(state: EditorState, cellPos: number): boolean {
  const lock = editLockKey.getState(state);
  return Boolean(lock?.isLocked(state.doc, cellPos + 1));
}

/**
 * A plugin view that forgets the border under the pointer when anything the editor sits in
 * scrolls, as the border then moves away from the pointer; a drag keeps it.
 */
export function forgetBorderOnScroll(key: PluginKey<BorderState>) {
  return (view: EditorView): PluginView => {
    const owner = view.dom.ownerDocument;
    const scrolled = () => {
      const current = key.getState(view.state);
      if (!view.isDestroyed && current && current.handle >= 0 && !current.dragging) {
        view.dispatch(view.state.tr.setMeta(key, NO_BORDER));
      }
    };
    owner.addEventListener('scroll', scrolled, { capture: true, passive: true });
    return { destroy: () => owner.removeEventListener('scroll', scrolled, { capture: true }) };
  };
}
