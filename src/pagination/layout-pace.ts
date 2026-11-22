// How a projection paces its layouts: what it counts, whether a change came since the latest one,
// and what it checks once a layout is drawn.

import type { LayoutMemory } from './layout-document.js';
import type { createLayoutReadiness } from './layout-readiness.js';
import type { DrawChecks } from './layout-validation.js';
import type { createPaginationCounter } from './pagination-stats.js';
import type { TextEngineHolder } from './text-engine-holder.js';

/** How the layouts are going: what they did, whether the pages settled, and what is due. */
export interface LayoutPace {
  readonly counter: ReturnType<typeof createPaginationCounter>;
  readonly readiness: ReturnType<typeof createLayoutReadiness>;
  /** Whether a change came, or the host asked for a layout, since the latest layout. */
  changed: boolean;
  /** The layouts in a row that moved the pages with no change in between. */
  passes: number;
  /** Whether the ghost's plugins start over at the next layout. */
  restart: boolean;
  /** What the latest layout found, which the next starts from (`LayoutMemory`). */
  readonly memory: LayoutMemory;
  /** Whether the pages still wait for what they measure with, such as the template's fonts. */
  readonly ready: { waiting(): boolean };
  /** What is checked once a layout is drawn: pages drawn taller than they are (`checkDraws`). */
  readonly draws: DrawChecks;
  /** The text layout engine, with the `textLayout` option. */
  readonly text: TextEngineHolder | null;
}
