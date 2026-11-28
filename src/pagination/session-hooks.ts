// What a projection's session hands its typing probe and its host as the served fonts settle.

import type { PagesLayout } from '../document/pages-layout.js';
import { typesetMathOf } from '../engine/math-views.js';
import { followDocument } from './layout-source.js';
import { layoutSettled, pagesLayout } from './pages-layout.js';
import { isIdle, refreshLayout, type Session } from './projection-session.js';

/**
 * The pages typing reads (DOCE-PAGINATION-5.17), with the layout's source moved onto the canonical
 * document first, so the next layout keeps the blocks the probe lays out.
 */
export function typedPages(session: Session) {
  session.source = followDocument(session.source, session.canonical.doc);
  const { projection, map, pace, source, footnoteNumbering } = session;
  return {
    projection: projection.doc,
    map,
    source,
    footnoteNumbering,
    engine: pace.text?.engine() ?? null,
  };
}

/** Hands over the pages as laid out, with the numbers they draw and how far they have settled. */
export function projectionPagesLayout(session: Session): PagesLayout | null {
  const { canonical, projection, pace, options, footnoteNumbering } = session;
  const state = pace.readiness.state();
  const settled = options.fontsPending
    ? state === 'settled' && !options.fontsPending()
    : layoutSettled(state, options.element);
  return pagesLayout(projection, {
    footnoteNumbering,
    settled,
    markup: options.textLayout?.markup?.() ?? 'all',
    typesetOf: (node) => typesetMathOf(canonical, node),
  });
}

/**
 * The served fonts started or stopped being pending (`fontsPending`): the pages are pending, and
 * settle once nothing is due, laid out again only when a change waits for a layout
 * (DOCE-PAGINATION-7.6).
 */
export function recheckFonts(session: Session): void {
  const { pace } = session;
  if (session.destroyed || pace.readiness.state() === 'failed') return;
  if (pace.changed) return refreshLayout(session, false);
  pace.readiness.pending(() => {
    if (!session.cancelLayout) pace.readiness.laidOut(() => isIdle(session));
  });
}
