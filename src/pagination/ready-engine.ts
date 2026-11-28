// The layout engine a projection lays its pages out with, once it can.

import { writeTrace } from './layout-trace.js';
import { mathReadiness } from './math-wait.js';
import type { Session } from './projection-session.js';
import { engineOrFailure } from './text-engine-holder.js';
import type { PagesTextEngine } from './text-engine-types.js';

/** The engine and whether a layout with it will use provisional math boxes. */
export interface ReadyLayoutEngine {
  readonly engine: PagesTextEngine;
  readonly provisionalMath: boolean;
}

/**
 * The engine once it and its math are ready, pending while waiting for one, or failed if there
 * can be none. `again` asks for the layout once the math is ready.
 */
export function readyEngine(
  { canonical, pace, options }: Session,
  again: () => void,
): ReadyLayoutEngine | 'pending' | 'failed' {
  const engine = engineOrFailure(pace.text);
  if (typeof engine === 'string') {
    writeTrace(options.trace, 'fail', () => ({ reason: engine }));
    return 'failed';
  }
  if (!engine) return 'pending';
  const waiting = {
    canonical,
    engine,
    owner: options.element.ownerDocument,
    readiness: pace.readiness,
    trace: options.trace,
  };
  const math = mathReadiness(waiting, again);
  return math === 'pending' ? 'pending' : { engine, provisionalMath: math === 'provisional' };
}
