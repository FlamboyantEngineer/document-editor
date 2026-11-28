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
// The latest pending math a late projection listens for.
const listening = new WeakMap<object, { doc: EditorState['doc']; promise: Promise<unknown> }>();

/** What a layout waits with: the state laid out, the document it shows in, and its readiness. */
interface Waiting {
  readonly canonical: EditorState;
  readonly owner: Document;
  readonly engine: PagesTextEngine;
  readonly readiness: object;
  /** Where the layout's trace goes, which tells of math that ran past the wait. */
  readonly trace?: LayoutTraceSink | undefined;
}

/**
 * Whether the current document's math is ready, still holds up layout, or is past the deadline
 * and takes provisional boxes. `resume` runs at the deadline or when the awaited math settles.
 */
export function mathReadiness(
  input: Waiting,
  resume: () => void,
): 'ready' | 'pending' | 'provisional' {
  const { canonical, owner, engine, readiness, trace } = input;
  const typesetting = mathTypesetReady(canonical, canonical.doc, owner);
  const waiting = typesetting ?? engine.mathPending(canonical.doc);
  if (!waiting) {
    listening.delete(readiness);
    return 'ready';
  }
  if (late.has(readiness)) {
    listenLate(input, waiting, resume);
    return 'provisional';
  }
  void askBefore(() => waiting, { timeout: MATH_WAIT_TIMEOUT }).then((asked) => {
    if (!asked.answered && asked.why === 'timed-out') {
      late.add(readiness);
      writeTrace(trace, 'mathLate', () => ({ reason: 'timed-out' }));
    }
    resume();
  });
  return 'pending';
}

// Asks for the layout only when the latest math the projection checked settles.
function listenLate(
  { canonical, readiness }: Waiting,
  waiting: Promise<unknown>,
  resume: () => void,
): void {
  const previous = listening.get(readiness);
  if (previous?.doc === canonical.doc && previous.promise === waiting) return;
  const current = { doc: canonical.doc, promise: waiting };
  listening.set(readiness, current);
  const settled = () => {
    if (listening.get(readiness) !== current) return;
    listening.delete(readiness);
    resume();
  };
  waiting.then(settled, settled);
}
