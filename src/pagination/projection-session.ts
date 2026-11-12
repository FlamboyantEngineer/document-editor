// What a paged projection does between its two documents: send input to the canonical state,
// mirror canonical changes onto the pages, route the browser's own edits and lay the pages out. A
// session holds both documents, the map between them and the views, and every step reads it.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Command, EditorState, Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { FragmentRules } from '../model/index.js';
import { readDomSelection } from '../utils/dom-selection.js';
import type { holdCellSelection } from './cell-drag.js';
import { frameIn, type settleEdits } from './layout-triggers.js';
import type { MeasureCache } from './measure-blocks.js';
import {
  copyMeta,
  isColumnWidthChange,
  routeColumnWidth,
  routeDomChange,
} from './projection-input.js';
import { layOutProjection } from './projection-layout.js';
import { createProjectionMap, type ProjectionMap } from './projection-map.js';
import { mirrorChange } from './projection-mirror.js';
import type { ProjectionViewOptions } from './projection-view.js';
import { canonicalSelection, selectionAcrossBreak } from './selection-mirror.js';

/** Marks the transactions the projection takes: a layout's, or a canonical change mirrored. */
export const PROJECTION_META = 'projection-view';

/** A projection's state before its views exist. */
export interface SessionCore {
  readonly options: ProjectionViewOptions;
  readonly rules: FragmentRules;
  readonly cache: MeasureCache;
  readonly cells: ReturnType<typeof holdCellSelection>;
  readonly counts: { layouts: number; refused: number; relaid: number };
  canonical: EditorState;
  /** The canonical document the projection shows: a layout's, then each change mirrored. */
  shown: ProseMirrorNode;
  map: ProjectionMap;
  cancelLayout: (() => void) | null;
}

/** A projection with its views and the edits that wait for a layout. */
export interface Session extends SessionCore {
  readonly view: EditorView;
  readonly ghost: EditorView;
  readonly edits: ReturnType<typeof settleEdits>;
}

/** Takes a canonical transaction: applied, and handed to the host's `dispatch`. */
export function send(session: Session, tr: Transaction): void {
  session.canonical = session.canonical.apply(tr);
  session.options.dispatch?.(tr);
}

/** Moves the projection by a transaction of its own: a layout's or a mirror's. */
export function take(session: Session, tr: Transaction): void {
  const { view } = session;
  view.updateState(view.state.apply(tr.setMeta(PROJECTION_META, true)));
}

// Draws the projection's state again over a DOM change it did not take.
function refuse(session: Session): void {
  session.counts.refused += 1;
  session.view.updateState(session.view.state);
}

/** Mirrors the projection's selection onto the canonical state, unless a cell selection stands. */
export function syncSelection(session: Session): void {
  const { map, view, canonical, cells } = session;
  if (cells.held()) return;
  const mapped = canonicalSelection(map, view.state.selection, canonical.doc);
  if (mapped && !mapped.eq(canonical.selection)) send(session, canonical.tr.setSelection(mapped));
}

/** Lays the pages out once the scheduler runs, unless a layout is already due. */
export function requestLayout(session: Session): void {
  const schedule = session.options.schedule ?? frameIn(session.options.measureIn);
  session.cancelLayout ??= schedule(() => layout(session));
}

/** Lays the pages out from the ghost, steps the projection onto them and builds the map again. */
export function layout(session: Session): void {
  session.cancelLayout?.();
  session.cancelLayout = null;
  session.edits.cancel();
  const { view, ghost, canonical, cache, options, rules } = session;
  if (view.isDestroyed) return;
  if (view.composing) return requestLayout(session);
  const laidOut = layOutProjection(
    { view, ghost, canonical, cache },
    { ...options, fragmentRules: rules },
  );
  session.map = laidOut.map;
  session.shown = canonical.doc;
  take(session, laidOut.tr);
  session.counts.layouts += 1;
  options.onLayout?.();
}

/**
 * Mirrors the canonical state onto the projection from the document shown, by `tr` when it made
 * the state from that document; or lays the pages out at once when a step cannot be placed.
 */
export function showCanonical(session: Session, tr: Transaction | null): void {
  const { view, map, rules, canonical, shown } = session;
  const changed = canonical.doc !== shown;
  const by = changed && tr?.before === shown ? tr : null;
  const mirrored = mirrorChange({ view, map, rules }, { from: shown, canonical, tr: by });
  if (!mirrored) {
    session.counts.relaid += 1;
    return layout(session);
  }
  session.map = mirrored.map;
  session.shown = canonical.doc;
  take(session, changed ? mirrored.tr.scrollIntoView() : mirrored.tr);
  if (changed) session.edits.request();
}

/** Runs a command on the canonical state, with the projection's selection mirrored there first. */
export function runCommand(session: Session, command: Command): boolean {
  readDomSelection(session.view);
  syncSelection(session);
  session.cells.release();
  let ran = false;
  command(session.canonical, (tr) => {
    ran = true;
    send(session, tr);
    showCanonical(session, tr);
  });
  return ran;
}

/** A projection edit the browser made: routed to the canonical state, or refused and redrawn. */
export function routeInput(session: Session, tr: Transaction): void {
  if (isColumnWidthChange(tr)) {
    const ctr = routeColumnWidth(tr, { ...session, projection: session.view.state });
    if (!ctr) return refuse(session);
    send(session, ctr);
    return showCanonical(session, ctr);
  }
  syncSelection(session);
  const { canonical, map, view, rules } = session;
  const routed = routeDomChange(tr, { canonical, projection: view.state, map });
  if (!routed) return refuse(session);
  const { doc } = routed.projection;
  session.map = routed.atBreak ? createProjectionMap(doc, rules) : routed.map.on(doc);
  copyMeta(tr, routed.projection);
  take(session, routed.projection);
  send(session, routed.canonical);
  session.shown = session.canonical.doc;
  session.edits.request();
}

/** Moves the caret a character across a page break inside a split block; false elsewhere. */
export function moveAcrossBreak(
  session: Session,
  move: { readonly direction: -1 | 1; readonly extend: boolean },
): boolean {
  const { view } = session;
  readDomSelection(view);
  const moved = selectionAcrossBreak(view, session.map, move);
  if (moved) view.dispatch(moved);
  return Boolean(moved);
}
