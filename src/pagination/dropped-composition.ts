// A composition the browser dropped without ending it: drawing the text again under a composition,
// as taking back an edit the pages refused does, makes the browser drop it without a
// compositionend, and take it up again, if at all, on the next key. The view would wait for its end
// for good, and the pages for the view.

import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

/** How long a composition may stay silent, once an edit of it was refused, before it counts as dropped. */
export const DROPPED_COMPOSITION_MS = 1000;

const COMPOSITION_EVENTS = ['compositionstart', 'compositionupdate', 'compositionend'] as const;

// The views whose composition is watched.
const watched = new WeakSet<EditorView>();

/**
 * Draws a state again over an edit the view made and the pages refused, watching the composition it
 * was part of: `dropped` runs once that composition counts as dropped.
 */
export function redrawRefused(
  view: EditorView | null,
  state: EditorState,
  dropped: () => void,
): void {
  if (!view) return;
  view.updateState(state);
  if (view.composing) watchDroppedComposition(view, dropped);
}

/**
 * Watches the view's composition until it ends: one that sends nothing for `DROPPED_COMPOSITION_MS`
 * is told it ended, and `dropped` runs.
 */
function watchDroppedComposition(view: EditorView, dropped: () => void): void {
  const owner = view.dom.ownerDocument.defaultView;
  if (!owner || watched.has(view)) return;
  watched.add(view);
  let timer = 0;
  const stop = () => {
    owner.clearTimeout(timer);
    watched.delete(view);
    for (const type of COMPOSITION_EVENTS) view.dom.removeEventListener(type, hear);
  };
  const quiet = () => {
    stop();
    if (view.isDestroyed || !view.composing) return;
    view.dom.dispatchEvent(new owner.CompositionEvent('compositionend', { data: '' }));
    dropped();
  };
  function hear(event: Event) {
    if (event.type === 'compositionend') {
      stop();
      return;
    }
    owner?.clearTimeout(timer);
    timer = owner?.setTimeout(quiet, DROPPED_COMPOSITION_MS) ?? 0;
  }
  for (const type of COMPOSITION_EVENTS) view.dom.addEventListener(type, hear);
  timer = owner.setTimeout(quiet, DROPPED_COMPOSITION_MS);
}
