// What the context menu opens on: the position under the pointer or at the caret, with what is
// there, as the editor's own groups and the host's providers read it.

import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import {
  isPositionLocked,
  listSuggestions,
  objectBlockAt,
  type ProofingIssueAt,
  proofingIssueAt,
  type Suggestion,
} from '../../engine/index.js';

/** The kinds of place the editor tells apart; a host's own node types are named by their type. */
export type ContextKind =
  | 'text'
  | 'table-cell'
  | 'figure'
  | 'code'
  | 'math'
  | 'contents'
  | 'footnote'
  | 'link'
  | 'reference'
  | (string & {});

/** What the context menu opens on. */
export interface ContextTarget {
  /** The position under the pointer, or the caret's. */
  readonly pos: number;
  readonly kind: ContextKind;
  /** The innermost node there that is not text: an inline atom, or the block holding it. */
  readonly node: ProseMirrorNode | null;
  readonly nodePos: number | null;
  /** The marks of the text there. */
  readonly marks: readonly Mark[];
  /** The id of the innermost element there that has one. */
  readonly elementId: string | null;
  /** The cell's row and column, from 0, in a table. */
  readonly tableCell: { readonly row: number; readonly column: number } | null;
  readonly proofingIssue: ProofingIssueAt | null;
  readonly suggestion: Suggestion | null;
  /** Whether the writer can edit the document now. */
  readonly editable: boolean;
  /** Whether the position is locked (`createEditLock`). */
  readonly locked: boolean;
}

const OBJECT_KINDS: Readonly<Record<string, ContextKind>> = {
  figure: 'figure',
  code_block: 'code',
  linked_code_block: 'code',
  math_display: 'math',
  toc_block: 'contents',
};

const INLINE_KINDS: Readonly<Record<string, ContextKind>> = {
  footnote_reference: 'footnote',
  math_inline: 'math',
};

const MARK_KINDS: Readonly<Record<string, ContextKind>> = {
  link: 'link',
  reference: 'reference',
};

function tableCellAt(state: EditorState, pos: number) {
  const $pos = state.doc.resolve(pos);
  for (let depth = $pos.depth; depth > 2; depth -= 1) {
    const name = $pos.node(depth).type.name;
    if (name !== 'table_cell' && name !== 'table_header') continue;
    return { row: $pos.index(depth - 2), column: $pos.index(depth - 1) };
  }
  return null;
}

function elementIdAt(state: EditorState, pos: number): string | null {
  const $pos = state.doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const id = $pos.node(depth).attrs.dataId as unknown;
    if (typeof id === 'string' && id) return id;
  }
  return null;
}

// The innermost node at a position that is not text, with its position and its kind.
function placeAt(state: EditorState, pos: number) {
  const { doc, selection } = state;
  const atom = doc.nodeAt(pos);
  if (atom && atom.isInline && !atom.isText) {
    return { node: atom, nodePos: pos, kind: INLINE_KINDS[atom.type.name] ?? atom.type.name };
  }
  const object = objectBlockAt(selection);
  const objectNode = object === null ? null : doc.nodeAt(object);
  if (object !== null && objectNode && OBJECT_KINDS[objectNode.type.name]) {
    return { node: objectNode, nodePos: object, kind: OBJECT_KINDS[objectNode.type.name] };
  }
  const $pos = doc.resolve(pos);
  const depth = $pos.depth;
  return {
    node: depth > 0 ? $pos.node(depth) : null,
    nodePos: depth > 0 ? $pos.before(depth) : null,
    kind: null,
  };
}

/** What the context menu opens on at a position of a state. */
export function resolveContextTarget(
  state: EditorState,
  pos: number,
  editable: boolean,
): ContextTarget {
  const at = Math.max(0, Math.min(pos, state.doc.content.size));
  const marks = state.doc.resolve(at).marks();
  const tableCell = tableCellAt(state, at);
  const place = placeAt(state, at);
  const markKind = marks.map((mark) => MARK_KINDS[mark.type.name]).find(Boolean);
  const kind = place.kind ?? markKind ?? (tableCell ? 'table-cell' : 'text');
  return {
    pos: at,
    kind,
    node: place.node,
    nodePos: place.nodePos,
    marks,
    elementId: elementIdAt(state, at),
    tableCell,
    proofingIssue: proofingIssueAt(state, at),
    suggestion: listSuggestions(state.doc).find((each) => each.from <= at && at <= each.to) ?? null,
    editable,
    locked: isPositionLocked(state, at),
  };
}
