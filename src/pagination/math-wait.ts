// Holds the pages' layout back while the document's math typesets, and while the math layouter
// loads what laying it out needs (DOCE-PAGINATION-10.8, 14.4): math is sized from what it typeset
// as, by its layout, so the pages are laid out once both are ready, and never again for them.

import type { EditorState } from 'prosemirror-state';
import { mathTypesetReady } from '../engine/math-views.js';
import type { PagesTextEngine } from './text-engine-types.js';

/** What a layout waits with: the state laid out, the document it shows in, and its readiness. */
interface Waiting {
  readonly canonical: EditorState;
  readonly owner: Document;
  readonly pace: {
    readonly readiness: { pending(): void };
    readonly text?: { engine(): PagesTextEngine | null } | null | undefined;
  };
}

/**
 * Whether the canonical state's math views still typeset its document's math, or the engine's
 * math layouter still loads what laying it out needs, the layout then pending; `resume` is called
 * once they have.
 */
export function waitsForMath({ canonical, owner, pace }: Waiting, resume: () => void): boolean {
  const typesetting = mathTypesetReady(canonical, canonical.doc, owner);
  const waiting = typesetting ?? pace.text?.engine()?.mathPending(canonical.doc) ?? null;
  if (!waiting) return false;
  pace.readiness.pending();
  void waiting.then(resume, resume);
  return true;
}
