// Selections between the paged projection and the canonical state. The writer selects on the
// projection, and every command runs on the canonical state, so the projection's selection is
// mirrored there before a command, and the canonical selection back after it. Both sides of a page
// break are one canonical position: mirrored back, a position keeps to the side nearest where the
// projection's selection was. A cell selection may span the parts of a split table, which are
// separate tables on the projection, so it lives on the canonical state and is drawn on every part.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import {
  AllSelection,
  type EditorState,
  NodeSelection,
  Plugin,
  type Selection,
  TextSelection,
  type Transaction,
} from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { ProjectionMap } from './projection-map.js';

// The projection position of a canonical one nearest `near`, where a page break gives two.
function nearest(map: ProjectionMap, pos: number, near: number): number | null {
  const before = map.toProjection(pos, -1);
  const after = map.toProjection(pos, 1);
  if (before === null || after === null) return before ?? after;
  return Math.abs(before - near) <= Math.abs(after - near) ? before : after;
}

/**
 * The canonical selection as a selection of the projection `map` maps to, near `near` where a page
 * break gives a position two places. A cell selection becomes a caret in its head cell, as it is
 * drawn by decorations (`cellSelectionDecorations`).
 */
export function projectionSelection(
  map: ProjectionMap,
  selection: Selection,
  near: Selection,
): Selection {
  const doc = map.projection;
  if (selection instanceof AllSelection) return new AllSelection(doc);
  if (selection instanceof CellSelection) {
    const head = map.toProjection(selection.$headCell.pos + 1, 1);
    return TextSelection.near(doc.resolve(head ?? near.head));
  }
  if (selection instanceof NodeSelection) {
    const at = map.toProjection(selection.from, 1);
    if (at !== null && doc.nodeAt(at)?.type === selection.node.type) {
      return NodeSelection.create(doc, at);
    }
  }
  const anchor = nearest(map, selection.anchor, near.anchor);
  const head = nearest(map, selection.head, near.head);
  if (anchor === null || head === null) return TextSelection.near(doc.resolve(near.head));
  return TextSelection.between(doc.resolve(anchor), doc.resolve(head));
}

/** A projection selection as a selection of the canonical document; null when it maps nowhere. */
export function canonicalSelection(
  map: ProjectionMap,
  selection: Selection,
  doc: ProseMirrorNode,
): Selection | null {
  if (selection instanceof AllSelection) return new AllSelection(doc);
  if (selection instanceof NodeSelection) {
    const at = map.toCanonical(selection.from, 1);
    const node = at === null ? null : doc.nodeAt(at);
    return at !== null && node?.type === selection.node.type ? NodeSelection.create(doc, at) : null;
  }
  const anchor = map.toCanonical(selection.anchor, 1);
  const head = map.toCanonical(selection.head, 1);
  if (anchor === null || head === null) return null;
  return TextSelection.between(doc.resolve(anchor), doc.resolve(head));
}

/** What the cell selection decorations read: the canonical selection and the current map. */
export interface CellSelectionSource {
  selection(): Selection;
  map(): ProjectionMap;
}

/** A projection plugin that draws a canonical cell selection on every part of its table. */
export function cellSelectionDecorations(source: CellSelectionSource): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const selection = source.selection();
        const map = source.map();
        if (!(selection instanceof CellSelection) || state.doc !== map.projection) return null;
        const decorations: Decoration[] = [];
        selection.forEachCell((cell, pos) => {
          const at = map.toProjection(pos, 1);
          const node = at === null ? null : state.doc.nodeAt(at);
          if (at !== null && node?.type === cell.type) {
            decorations.push(Decoration.node(at, at + node.nodeSize, { class: 'selectedCell' }));
          }
        });
        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}

/**
 * The selection an arrow key gives at a page break inside a split block, a character on in the
 * canonical text, where the browser's move to the other side of the break would not move the
 * canonical caret; null when the caret is not at such a break.
 */
export function selectionAcrossBreak(
  state: EditorState,
  map: ProjectionMap,
  move: { readonly direction: -1 | 1; readonly extend: boolean },
): Transaction | null {
  const { direction, extend } = move;
  if (!extend && !state.selection.empty) return null;
  const { head } = state.selection;
  const $head = state.doc.resolve(head);
  const atEdge = direction > 0 ? head === $head.end() : head === $head.start();
  if (!atEdge || !$head.parent.isTextblock) return null;
  const at = map.toCanonical(head, 1);
  const twin = at === null ? null : map.toProjection(at, direction);
  if (at === null || twin === null || twin === head) return null;
  const $at = map.canonical.resolve(at);
  const next = at + direction;
  if (next < $at.start() || next > $at.end()) return null;
  const target = map.toProjection(next, direction);
  if (target === null) return null;
  const anchor = extend ? state.selection.anchor : target;
  return state.tr.setSelection(
    TextSelection.between(state.doc.resolve(anchor), state.doc.resolve(target)),
  );
}
