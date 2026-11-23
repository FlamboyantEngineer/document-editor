// What the projection's measuring view asks of the layout: the blocks that changed size measured
// again, and every block and atom on a screen of another pixel ratio (`holdMeasureScale`).

import { followMeasuring } from './layout-triggers.js';
import { holdMeasureScale } from './measure-scale.js';
import { refreshLayout, requestLayout, type Session } from './projection-session.js';

/** Follows what the projection's measuring view needs measured again; returns what stops it. */
export function remeasureGhost(live: Session): () => void {
  const stop = followMeasuring(live.options.measureIn, {
    cache: live.cache,
    view: () => live.ghost.view,
    request: () => requestLayout(live),
  });
  const stopScale = holdMeasureScale(live.options.measureIn, () => {
    live.pace.text?.remeasure();
    refreshLayout(live, true);
  });
  return () => {
    stop();
    stopScale();
  };
}
