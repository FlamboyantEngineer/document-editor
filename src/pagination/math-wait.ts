// Holds the pages' layout back while the document's math typesets, and while the math layouter
// loads what laying it out needs (DOCE-PAGINATION-10.8, 14.4): math is sized from what it typeset
// as, by its layout, so the pages are laid out once both are ready, and never again for them.
// Past the wait the pages are laid out with the math they have, and again once it arrives.

import type { EditorState } from 'prosemirror-state';
import { mathTypesetReady } from '../engine/math-views.js';
import { askBefore } from '../utils/ask-before.js';
import { type LayoutTraceSink, writeTrace } from './layout-trace.js';
import type { PagesTextEngine } from './text-engine-types.js';

/**
 * How long the pages wait for the document's math to typeset and its layout to load. Past it they
 * are laid out with the math they have, provisional, and wait on it no more (DOCE-PAGINATION-14.4).
 */
export const MATH_WAIT_TIMEOUT = 30_000;

// The readiness of each projection whose math ran past the wait.
const late = new WeakSet<object>();
// The readiness of each late projection that listens for its pending math, one listener at a time.
const listening = new WeakSet<object>();

/** What a layout waits with: the state laid out, the document it shows in, and its readiness. */
interface Waiting {
  readonly canonical: EditorState;
  readonly owner: Document;
  readonly pace: {
    readonly readiness: { pending(): void };
    readonly text?: { engine(): PagesTextEngine | null } | null | undefined;
  };
  /** Where the layout's trace goes, which tells of math that ran past the wait. */
  readonly trace?: LayoutTraceSink | undefined;
}

/**
 * Whether the canonical state's math views still typeset its document's math, or the engine's
 * math layouter still loads what laying it out needs, the layout then pending; `resume` is called
 * once they have, or once `MATH_WAIT_TIMEOUT` has passed. From then on the projection no longer
 * waits on math, but `resume` is still called once its pending math settles, so late math lays
 * the pages out again when it arrives.
 */
export function waitsForMath(
  { canonical, owner, pace, trace }: Waiting,
  resume: () => void,
): boolean {
  const typesetting = mathTypesetReady(canonical, canonical.doc, owner);
  const waiting = typesetting ?? pace.text?.engine()?.mathPending(canonical.doc) ?? null;
  if (late.has(pace.readiness)) {
    if (waiting) listenLate(pace.readiness, waiting, resume);
    return false;
  }
  if (!waiting) return false;
  void askBefore(() => waiting, { timeout: MATH_WAIT_TIMEOUT }).then((asked) => {
    if (!asked.answered && asked.why === 'timed-out') {
      late.add(pace.readiness);
      writeTrace(trace, 'mathLate', () => ({ reason: 'timed-out' }));
      listenLate(pace.readiness, waiting, resume);
    }
    resume();
  });
  pace.readiness.pending();
  return true;
}

// Asks for the layout once a late projection's pending math settles, unless it already listens.
function listenLate(readiness: object, waiting: Promise<unknown>, resume: () => void): void {
  if (listening.has(readiness)) return;
  listening.add(readiness);
  const settled = () => {
    listening.delete(readiness);
    resume();
  };
  waiting.then(settled, settled);
}
