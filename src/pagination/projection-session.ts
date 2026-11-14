// What a paged projection does between its two documents: send input to the canonical state,
// mirror canonical changes onto the pages, route the browser's own edits and lay the pages out. A
// session holds both states, the map between them and the ghost, and every step reads it. The
// projection's state is the session's to change; whatever renders it is told of each new one.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type Command, EditorState, type Transaction } from 'prosemirror-state';
import { Transform } from 'prosemirror-transform';
import type { EditorView } from 'prosemirror-view';
import type { FragmentRules } from '../model/index.js';
import { readDomSelection } from '../utils/dom-selection.js';
import { caretPlace } from './caret.js';
import type { holdCellSelection } from './cell-drag.js';
import type { MeasuringView } from './ghost-view.js';
import type { LayoutMemory } from './layout-document.js';
import { wantsLayoutNow } from './layout-latency.js';
import { markLayout } from './layout-marks.js';
import type { createLayoutReadiness } from './layout-readiness.js';
import { frameIn, type settleEdits } from './layout-triggers.js';
import type { DrawChecks } from './layout-validation.js';
import type { MeasureCache } from './measure-blocks.js';
import { showOnPages } from './page-map.js';
import type { createPaginationCounter } from './pagination-stats.js';
import type { PagedProjectionOptions } from './projection.js';
import {
  copyMeta,
  isColumnWidthChange,
  routeColumnWidth,
  routeDomChange,
} from './projection-input.js';
import { layOutProjection } from './projection-layout.js';
import { createProjectionMap, type ProjectionMap } from './projection-map.js';
import { mirrorChange } from './projection-mirror.js';
import { canonicalSelection, selectionAcrossBreak } from './selection-mirror.js';

/** Marks the transactions the projection takes: a layout's, or a canonical change mirrored. */
export const PROJECTION_META = 'projection-view';

// How many layouts in a row may move the pages with no change in between before the layout counts
// as not converging (DOCE-PAGINATION-7.6).
const LAYOUT_PASSES = 8;

// Where the caret was on screen before each laid-out document was taken, until it is drawn.
const caretBefore = new WeakMap<ProseMirrorNode, number | null>();

/**
 * Where the caret was on screen before the layout that made a document, once, so the view that
 * draws it can put the caret back there (DOCE-PAGINATION-5.8); null for none.
 */
export function takeCaretBefore(doc: ProseMirrorNode): number | null {
  const caret = caretBefore.get(doc) ?? null;
  caretBefore.delete(doc);
  return caret;
}

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
}

/** A projection's two states, the map between them, and what it counts. */
export interface Session {
  readonly options: PagedProjectionOptions;
  readonly rules: FragmentRules;
  readonly cache: MeasureCache;
  readonly cells: ReturnType<typeof holdCellSelection>;
  readonly counts: { refused: number; relaid: number };
  readonly ghost: MeasuringView;
  readonly edits: ReturnType<typeof settleEdits>;
  readonly pace: LayoutPace;
  canonical: EditorState;
  projection: EditorState;
  /** The canonical document the projection shows: a layout's, then each change mirrored. */
  shown: ProseMirrorNode;
  map: ProjectionMap;
  /** The view that renders the projection, once one is attached; its DOM is read before input. */
  view: EditorView | null;
  cancelLayout: (() => void) | null;
  /** Above 0 while transactions may not go through the view (`quietly`). */
  quiet: number;
}

/**
 * Takes a canonical transaction: applied with what the canonical plugins append to it, and handed
 * to the host's `dispatch`. Gives the transactions applied, the appended ones after it; none when a
 * plugin filtered it out.
 */
export function send(session: Session, tr: Transaction): readonly Transaction[] {
  const from = session.canonical;
  const { state, transactions } = from.applyTransaction(tr);
  session.canonical = state;
  session.options.dispatch?.(tr, { from, to: state });
  return transactions;
}

// The steps of transactions applied one after another, from the document the first starts from.
function chain(from: ProseMirrorNode, transactions: readonly Transaction[]): Transform {
  const all = new Transform(from);
  for (const each of transactions) for (const step of each.steps) all.step(step);
  return all;
}

// The projection's new state, told to whatever renders it.
function setProjection(session: Session, state: EditorState): void {
  session.projection = state;
  showPages(session, session.canonical.doc);
  session.options.onProjection(state);
}

// Records the pages a canonical document is shown on, with the session's map when it holds the
// positions between them, so reading the pages joins none of them (DOCE-PAGINATION-7.18).
function showPages(session: Session, canonical: ProseMirrorNode): void {
  const { map, rules } = session;
  const pages = session.projection.doc;
  const exact = map.projection === pages && canonical === session.shown;
  showOnPages(canonical, { pages, rules, positions: exact ? map : undefined });
}

// The view that renders the projection, when a transaction may go through it now: not while it
// dispatches one, nor while the host hands in a state, as it renders.
function dispatcher(session: Session): EditorView | null {
  const { view } = session;
  return view && !view.isDestroyed && session.quiet === 0 ? view : null;
}

/**
 * Moves the projection by a transaction of its own: a layout's or a mirror's. It goes through the
 * attached view when it can, so a view whose host renders through React state shows it before the
 * next key, as for the view's own transactions.
 */
export function take(session: Session, tr: Transaction): void {
  tr.setMeta(PROJECTION_META, true);
  const view = dispatcher(session);
  if (view) view.dispatch(tr);
  else setProjection(session, session.projection.apply(tr));
}

/**
 * Has the view build its node views again once the canonical state's plugins change, as the
 * canonical plugins' node views are read through the projection's (DOCE-PAGINATION-7.15).
 */
export function replug(session: Session): void {
  const { projection } = session;
  setProjection(session, projection.reconfigure({ plugins: projection.plugins }));
}

/** Runs a step while transactions may not go through the view, as it dispatches or renders. */
export function quietly(session: Session, run: () => void): void {
  session.quiet += 1;
  try {
    run();
  } finally {
    session.quiet -= 1;
  }
}

// Draws the projection's state again over a DOM change it did not take.
function refuse(session: Session): void {
  session.counts.refused += 1;
  setProjection(session, session.projection);
  session.view?.updateState(session.projection);
}

/** Has the attached view report the selection and changes the browser shows but has not yet. */
export function readDom(session: Session): void {
  if (session.view) readDomSelection(session.view);
}

/**
 * Whether the browser shows a selection the view had not read yet, which it reads now and sends on
 * to the canonical state: a newer one than a state that changes only the selection, as after keys
 * pressed while the host still rendered a click's, so that state is not drawn over it.
 */
export function showsNewerSelection(session: Session): boolean {
  const before = session.projection.selection;
  readDom(session);
  return !session.projection.selection.eq(before);
}

/** Mirrors the projection's selection onto the canonical state, unless a cell selection stands. */
export function syncSelection(session: Session): void {
  const { map, projection, canonical, cells } = session;
  if (cells.held()) return;
  const mapped = canonicalSelection(map, projection.selection, canonical.doc);
  if (mapped && !mapped.eq(canonical.selection)) send(session, canonical.tr.setSelection(mapped));
}

/** Lays the pages out once the scheduler runs, unless a layout is already due. */
export function requestLayout(session: Session): void {
  session.pace.readiness.pending();
  const schedule = session.options.schedule ?? frameIn(session.options.measureIn);
  session.cancelLayout ??= schedule(() => layout(session));
}

/**
 * Lays the pages out again soon; `remeasure` forgets every measurement and starts the ghost's
 * plugins over.
 */
export function refreshLayout(session: Session, remeasure: boolean): void {
  if (remeasure) {
    session.cache.clear();
    session.pace.restart = true;
  }
  markChanged(session);
  session.edits.cancel();
  requestLayout(session);
}

/** A change, or the host asking for a layout: the count of layouts in a row starts over. */
export function markChanged(session: Session): void {
  session.pace.changed = true;
  session.pace.draws.changed();
  session.pace.readiness.pending();
}

// Lays the pages out from the ghost, with its plugins started over when the host asked.
function layOutPages(session: Session) {
  const { ghost, canonical, projection, cache, options, rules, pace } = session;
  if (pace.restart) {
    pace.restart = false;
    const { doc, plugins } = ghost.view.state;
    ghost.show(EditorState.create({ doc, plugins }));
  }
  return layOutProjection(
    { projection, ghost, canonical, cache, memory: pace.memory, onSection: pace.counter.section },
    { ...options, fragmentRules: rules },
  );
}

// The selection the browser shows and has not reported yet is the one the new pages keep
// (DOCE-EDITOR-1.4), not the one the layout would draw back over it; but pages that do not show
// the canonical document yet, as when a change could not be mirrored, hold no selection of it;
// nor do pages no view shows yet, which hold the canonical selection they started from.
function keepShownSelection(session: Session): void {
  if (!session.view || session.shown !== session.canonical.doc) return;
  readDom(session);
  syncSelection(session);
}

/**
 * Lays the pages out from the ghost, steps the projection onto them and builds the map again;
 * fails when layouts keep moving the pages with no change in between.
 */
export function layout(session: Session): void {
  session.cancelLayout?.();
  session.cancelLayout = null;
  session.edits.cancel();
  const { view, ghost, pace } = session;
  if (view?.isDestroyed || ghost.view.isDestroyed) return;
  if (view?.composing) return requestLayout(session);
  keepShownSelection(session);
  if (pace.changed) pace.passes = 0;
  else if (pace.passes >= LAYOUT_PASSES) return pace.readiness.fail();
  pace.changed = false;
  let laidOut: ReturnType<typeof layOutProjection>;
  try {
    laidOut = layOutPages(session);
  } catch (error) {
    pace.readiness.fail();
    throw error;
  }
  const before = session.projection.doc;
  pace.counter.layout(before, laidOut.tr.doc);
  pace.passes = laidOut.tr.docChanged ? pace.passes + 1 : 0;
  session.map = laidOut.map;
  session.shown = session.canonical.doc;
  if (laidOut.tr.docChanged && view) caretBefore.set(laidOut.tr.doc, caretPlace(view));
  take(session, markLayout(laidOut.tr, { metrics: laidOut.metrics, stats: pace.counter.stats() }));
  pace.readiness.laidOut(
    () => session.cancelLayout === null && !session.edits.waiting() && !pace.ready.waiting(),
  );
  session.options.onLayout?.(laidOut.tr);
}

/** How a canonical change is shown on the pages. */
export interface Showing {
  /** Lays the pages out on the next frame, not once the writer pauses (DOCE-PAGINATION-5.7). */
  readonly now: boolean;
  /** Scrolls the pages to the selection, as a transaction that made the change asked. */
  readonly scroll: boolean;
}

/**
 * How the transactions that made a change show it: laid out at once when one changed the
 * structure, and scrolled to the selection when one asked, as a view of the canonical state does.
 * A change nothing asked to scroll for, such as a collaborator's or a state the host replaced,
 * leaves the pages where the writer reads them.
 */
export function shownBy(made: readonly Transaction[]): Showing {
  return {
    now: made.some(wantsLayoutNow),
    scroll: made.some((each) => each.scrolledIntoView),
  };
}

/**
 * Mirrors the canonical state onto the projection from the document shown, by `tr` when it made
 * the state from that document; or lays the pages out at once when a step cannot be placed. The
 * pages are laid out on the next frame or once the writer pauses, and scrolled, as `how` says.
 */
export function showCanonical(session: Session, tr: Transform | null, how: Showing): void {
  const { projection, map, rules, canonical, shown } = session;
  const changed = canonical.doc !== shown;
  const by = changed && tr?.before === shown ? tr : null;
  const mirrored = mirrorChange({ projection, map, rules }, { from: shown, canonical, tr: by });
  if (!mirrored) {
    session.counts.relaid += 1;
    return layout(session);
  }
  session.map = mirrored.map;
  session.shown = canonical.doc;
  take(session, how.scroll ? mirrored.tr.scrollIntoView() : mirrored.tr);
  if (!changed) return;
  afterChange(session, how.now);
}

// A change shown on the pages: laid out on the next frame when `now`, or once the writer pauses.
function afterChange(session: Session, now: boolean): void {
  markChanged(session);
  if (now) requestLayout(session);
  else session.edits.request();
}

/**
 * Readies the canonical state for input: the browser's selection read, unless the view has just
 * read it, and mirrored there.
 */
export function prepare(session: Session, { fromDom = true } = {}): void {
  if (fromDom) readDom(session);
  syncSelection(session);
  session.cells.release();
}

/** Takes a transaction of the canonical state as it stands, and shows it on the pages at once. */
export function dispatchCanonical(session: Session, tr: Transaction): void {
  const made = send(session, tr);
  showCanonical(session, chain(tr.before, made), shownBy(made));
}

/** Runs a command on the canonical state, with the projection's selection mirrored there first. */
export function runCommand(session: Session, command: Command): boolean {
  prepare(session);
  let ran = false;
  command(session.canonical, (tr) => {
    ran = true;
    dispatchCanonical(session, tr);
  });
  return ran;
}

/** A projection edit the browser made: routed to the canonical state, or refused and redrawn. */
function routeInput(session: Session, tr: Transaction): void {
  if (isColumnWidthChange(tr)) {
    const ctr = routeColumnWidth(tr, session);
    if (!ctr) return refuse(session);
    const made = send(session, ctr);
    return showCanonical(session, chain(ctr.before, made), shownBy(made));
  }
  syncSelection(session);
  const { rules } = session;
  const routed = routeDomChange(tr, session);
  if (!routed) return refuse(session);
  const { doc } = routed.projection;
  session.map = routed.atBreak ? createProjectionMap(doc, rules) : routed.map.on(doc);
  // The pages now show the routed document, which the canonical state takes next.
  session.shown = routed.canonical.doc;
  // The mirror carries the edit's meta and not its scroll: scrolling to the caret reads its place,
  // a layout, on each typed key.
  copyMeta(tr, routed.projection);
  take(session, routed.projection);
  const made = send(session, routed.canonical);
  showPages(session, session.shown);
  const how = shownBy([tr, ...made]);
  // What the canonical plugins appended, or a change they refused, is mirrored after the edit.
  if (session.canonical.doc !== session.shown) {
    const appended = made[0] === routed.canonical ? made.slice(1) : null;
    return showCanonical(session, appended && chain(session.shown, appended), how);
  }
  afterChange(session, how.now);
}

/**
 * Takes a transaction of the projection's own state: a change of selection or of a plugin's
 * state, or an edit, which is routed to the canonical state.
 */
export function receive(session: Session, tr: Transaction): void {
  // A transaction made on pages the projection no longer holds, as a view still drawing the pages
  // of a document it has since replaced makes, is no edit of them.
  if (tr.before !== session.projection.doc) return;
  quietly(session, () => {
    const own = Boolean(tr.getMeta(PROJECTION_META));
    if (!own && tr.docChanged) return routeInput(session, tr);
    const before = session.projection.selection;
    setProjection(session, session.projection.apply(tr));
    if (!own && !session.projection.selection.eq(before)) syncSelection(session);
  });
}

/** Moves the caret a character across a page break inside a split block; false elsewhere. */
export function moveAcrossBreak(
  session: Session,
  move: { readonly direction: -1 | 1; readonly extend: boolean },
): boolean {
  readDom(session);
  const moved = selectionAcrossBreak(session.projection, session.map, move);
  if (!moved) return false;
  const view = dispatcher(session);
  if (view) view.dispatch(moved);
  else receive(session, moved);
  return true;
}
