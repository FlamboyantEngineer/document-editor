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
import { footnoteCopyNear, sameFootnoteIn } from './footnote-positions.js';
import { characterWidth } from './graphemes.js';
import { regionCopyNear, sameRegionIn } from './page-positions.js';
import type { ProjectionMap } from './projection-map.js';

// The projection position of a canonical one nearest `near`: on the side of a page break nearer it,
// and in the copy of a page header or footer it is in.
function nearest(map: ProjectionMap, pos: number, near: number): number | null {
  const at = nearestSide(map, pos, near);
  if (at === null) return null;
  const { projection } = map;
  return footnoteCopyNear(projection, regionCopyNear(projection, at, near), near);
}

// The projection position of a canonical one on the side of a page break nearer `near`. A side
// that stands for another canonical position, as a code fragment's end stands for the place before
// the line break its split dropped, is no place of this one.
function nearestSide(map: ProjectionMap, pos: number, near: number): number | null {
  const side = (assoc: -1 | 1) => {
    const at = map.toProjection(pos, assoc);
    return at !== null && map.toCanonical(at) === pos ? at : null;
  };
  const before = side(-1);
  const after = side(1);
  if (before === null || after === null) return before ?? after ?? map.toProjection(pos, 1);
  return Math.abs(before - near) <= Math.abs(after - near) ? before : after;
}

/** A selection in the same visual footnote occurrence of another projection, if still present. */
export function footnoteSelectionIn(selection: Selection, doc: ProseMirrorNode): Selection | null {
  const anchor = sameFootnoteIn(selection.$anchor, doc);
  const head = sameFootnoteIn(selection.$head, doc);
  if (anchor === null || head === null) return null;
  if (selection instanceof NodeSelection && doc.nodeAt(anchor)?.type === selection.node.type) {
    return NodeSelection.create(doc, anchor);
  }
  return TextSelection.between(doc.resolve(anchor), doc.resolve(head));
}

/**
 * A projection selection on the pages a transaction lays out again: mapped through it, or, in a
 * page's header or footer, which the new pages draw again, in the same page's copy of it.
 */
export function nearAfter(selection: Selection, tr: Transaction): Selection {
  const note = footnoteSelectionIn(selection, tr.doc);
  if (note) return note;
  const start = sameRegionIn(selection.$head, tr.doc);
  return start === null
    ? selection.map(tr.doc, tr.mapping)
    : TextSelection.near(tr.doc.resolve(start));
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
    // The fragment of a split atom the writer selected stays selected, whichever it is.
    if (
      near instanceof NodeSelection &&
      near.from < doc.content.size &&
      canonicalNodeAt(map, near.from, map.canonical) === selection.from
    ) {
      return NodeSelection.create(doc, near.from);
    }
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

/**
 * Whether the projection shows a canonical cell selection as the caret it is drawn with, not moved
 * since, so mirroring the projection's selection back would only lose the cells.
 */
export function showsCellSelection(
  map: ProjectionMap,
  canonical: Selection,
  projection: Selection,
): boolean {
  return (
    canonical instanceof CellSelection &&
    projectionSelection(map, canonical, projection).eq(projection)
  );
}

/**
 * Where the canonical node a projection node at `from` stands for starts: where `from` maps, or,
 * for a continued fragment of a split atom, which joining the pages drops so its start maps past
 * the whole block, the block ending there. The element id tells the two apart. Null when neither
 * holds a node of its type.
 */
export function canonicalNodeAt(
  map: ProjectionMap,
  from: number,
  doc: ProseMirrorNode,
): number | null {
  const selected = map.projection.nodeAt(from);
  const at = map.toCanonical(from, 1);
  if (!selected || at === null) return null;
  const id = selected.attrs.dataId as unknown;
  const same = (node: ProseMirrorNode | null | undefined): node is ProseMirrorNode =>
    node?.type === selected.type && (!id || node.attrs.dataId === id);
  if (same(doc.nodeAt(at))) return at;
  const before = doc.resolve(at).nodeBefore;
  return id && same(before) ? at - before.nodeSize : null;
}

/** A projection selection as a selection of the canonical document; null when it maps nowhere. */
export function canonicalSelection(
  map: ProjectionMap,
  selection: Selection,
  doc: ProseMirrorNode,
): Selection | null {
  if (selection instanceof AllSelection) return new AllSelection(doc);
  if (selection instanceof NodeSelection) {
    const at = canonicalNodeAt(map, selection.from, doc);
    return at === null ? null : NodeSelection.create(doc, at);
  }
  // A textblock's end keeps to the text before it, as a code fragment's end to the line break
  // after it.
  const anchor = map.toCanonical(selection.anchor);
  const head = map.toCanonical(selection.head);
  if (anchor === null || head === null) return null;
  return TextSelection.between(doc.resolve(anchor), doc.resolve(head));
}

/** What the cell selection decorations read: the canonical selection and the current map. */
interface CellSelectionSource {
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
  // The canonical character beyond the break, its whole grapheme cluster.
  const next = at + direction * characterWidth($at, direction);
  if (next < $at.start() || next > $at.end()) return null;
  const target = map.toProjection(next, direction);
  if (target === null) return null;
  const anchor = extend ? state.selection.anchor : target;
  return state.tr.setSelection(
    TextSelection.between(state.doc.resolve(anchor), state.doc.resolve(target)),
  );
}
