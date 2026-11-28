// What the projection's measuring view asks of the layout: every block and atom laid out again on a
// screen of another pixel ratio (`holdMeasureScale`). Nothing drawn in it is measured.

import { holdMeasureScale } from './measure-scale.js';
import { refreshLayout, type Session } from './projection-session.js';

/** Follows the pixel ratio of the projection's measuring view; returns what stops it. */
export function remeasureGhost(live: Session): () => void {
  return holdMeasureScale(live.options.measureIn, () => {
    live.pace.text?.remeasure();
    refreshLayout(live, true);
  });
}
