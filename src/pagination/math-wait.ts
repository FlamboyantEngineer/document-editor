// Holds the pages' layout back while the document's math typesets (DOCE-PAGINATION-10.8): math is
// sized from what it typeset as, so the pages are laid out once it is, and not again when a view
// draws it.

import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { mathTypesetReady } from '../engine/math-views.js';

/** What a layout waits with: the state laid out, its measuring view and its readiness. */
interface Waiting {
  readonly canonical: EditorState;
  readonly ghost: { readonly view: EditorView };
  readonly pace: { readonly readiness: { pending(): void } };
}

/**
 * Whether the canonical state's math views still typeset its document's math, the layout then
 * pending; `resume` is called once they have.
 */
export function waitsForMath({ canonical, ghost, pace }: Waiting, resume: () => void): boolean {
  const typesetting = mathTypesetReady(canonical, canonical.doc, ghost.view.dom.ownerDocument);
  if (!typesetting) return false;
  pace.readiness.pending();
  void typesetting.then(resume);
  return true;
}
