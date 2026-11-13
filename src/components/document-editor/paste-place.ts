// Where pasted or dropped images go once they are uploaded: the selection they were pasted or
// dropped at, followed through whatever changed the document while they uploaded, so a writer who
// writes on elsewhere, or another writer's change, does not move them. The place is found by
// comparing the document it was made in with the one shown, rather than by following
// transactions, because the host may show a state the view never dispatched.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, NodeSelection, type Selection } from 'prosemirror-state';
import { Mapping, StepMap } from 'prosemirror-transform';
import type { EditorView } from 'prosemirror-view';
import { type FigureSource, insertFigure } from '../../engine/index.js';

/** A selection, and the document it was made in. */
export interface PastePlace {
  readonly doc: ProseMirrorNode;
  readonly selection: Selection;
}

// What changed between two documents, as the one range that differs: positions before it stay,
// those after it move by what it gained or lost, and those inside it go to its end. It is exact
// while the changes lie on one side of a position.
function changeBetween(before: ProseMirrorNode, after: ProseMirrorNode): Mapping {
  const start = before.content.findDiffStart(after.content);
  const end = before.content.findDiffEnd(after.content);
  if (start === null || !end) return new Mapping();
  // Where the content around a change repeats, the ends found pass its start.
  const overlap = Math.max(0, start - Math.min(end.a, end.b));
  return new Mapping([new StepMap([start, end.a + overlap - start, end.b + overlap - start])]);
}

// Every position moved by the same distance.
const shift = (by: number) => new Mapping([new StepMap(by >= 0 ? [0, 0, by] : [0, -by, 0])]);

// The nodes a selection is on or in, innermost first, each with its position: the node selected,
// then the blocks around the selection.
function anchorsOf(selection: Selection) {
  const { $from } = selection;
  const anchors =
    selection instanceof NodeSelection ? [{ node: selection.node, pos: selection.from }] : [];
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    anchors.push({ node: $from.node(depth), pos: $from.before(depth) });
  }
  return anchors;
}

// Where a node of an earlier document is now, while the document holds it unchanged: changes
// elsewhere leave a node the very object it was. A copy pasted elsewhere is that object too, so of
// several places the one nearest to `near` is taken.
function positionOf(doc: ProseMirrorNode, node: ProseMirrorNode, near: number): number | null {
  const found: number[] = [];
  doc.descendants((each, pos) => {
    if (each === node) found.push(pos);
    return each !== node;
  });
  if (found.length === 0) return null;
  return found.reduce((best, pos) => (Math.abs(pos - near) < Math.abs(best - near) ? pos : best));
}

/**
 * The place in the document a state shows now. A block the place is in, found unchanged in that
 * document, carries the place with it, whatever changed before and after it; when the blocks
 * around the place changed themselves, the place follows the one range that differs.
 */
export function placeIn(place: PastePlace, state: EditorState): Selection {
  if (place.doc === state.doc) return place.selection;
  const change = changeBetween(place.doc, state.doc);
  for (const anchor of anchorsOf(place.selection)) {
    const now = positionOf(state.doc, anchor.node, change.map(anchor.pos));
    if (now !== null) return place.selection.map(state.doc, shift(now - anchor.pos));
  }
  return place.selection.map(state.doc, change);
}

/**
 * Inserts a figure at a place, in one change, and returns the figure's place, so the next one
 * follows it. A writer who has done nothing since has the figure selected, as when they insert
 * one; one who has written or moved on keeps their selection, or their next key would replace the
 * figure.
 */
export function insertFigureAt(
  view: EditorView,
  place: PastePlace,
  source: FigureSource,
): PastePlace {
  const { state } = view;
  const selection = placeIn(place, state);
  const isUntouched = state.doc === place.doc && state.selection.eq(selection);
  let left: PastePlace = { doc: state.doc, selection };
  // The command reads the document and the selection alone, so it runs on a state of just those
  // with the place as its selection; the view's own state then takes the change it made.
  insertFigure(source)(EditorState.create({ doc: state.doc, selection }), (tr) => {
    left = { doc: tr.doc, selection: tr.selection };
    view.dispatch(isUntouched ? tr : tr.setSelection(state.selection.map(tr.doc, tr.mapping)));
  });
  return left;
}
