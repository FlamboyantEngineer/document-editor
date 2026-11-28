// The layout engine a projection lays its pages out with, once it can.

import { waitsForMath } from './math-wait.js';
import type { Session } from './projection-session.js';
import { engineOrFailure } from './text-engine-holder.js';
import type { PagesTextEngine } from './text-engine-types.js';

/**
 * The engine once it and its math are ready; else null, with the layout pending, or failed without
 * one to wait for. `again` asks for the layout once the math is ready.
 */
export function readyEngine(session: Session, again: () => void): PagesTextEngine | null {
  const { pace, options } = session;
  // An optional readiness input cannot supply a missing engine.
  if (session.destroyed || (pace.text && pace.ready.blocked())) return null;
  const engine = pace.readiness.engine(engineOrFailure(pace.text), options.trace);
  if (!engine) return null;
  const waiting = { ...session, owner: options.element.ownerDocument };
  return waitsForMath(waiting, again) ? null : engine;
}
