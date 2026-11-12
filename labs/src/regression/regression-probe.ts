// What the regression lab shows its scenarios (`e2e/regression.spec.ts`) on `window.regressionLab`:
// the document as it would be stored, and a caret put at a split block's fragment boundary. The
// scenarios read pages from the page's DOM and the document from here, so they do not depend on
// how the editing state holds the pages.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { type RefObject, useEffect } from 'react';
import type { DocumentEditorHandle } from '../../../src/components/index.js';
import {
  type DocumentFile,
  joinDocumentPages,
  type StoredNode,
  writeDocumentFile,
} from '../../../src/model/index.js';
import { pageMap } from '../../../src/pagination/index.js';

/** Where a caret goes at a fragment boundary: the head fragment's end or its continuation's start. */
export type FragmentEdge = 'head-end' | 'continuation-start';

/** The regression lab's probe on `window.regressionLab`. */
export interface RegressionProbe {
  /** The document as the writer stores it, its split blocks joined whole. */
  stored(): DocumentFile | null;
  /**
   * Puts the caret, focused, at the first boundary between two fragments of a split block of a
   * type, inside the boundary's text blocks; null when no block of the type is split.
   */
  caretAtFragment(type: string, edge: FragmentEdge): FragmentCaret | null;
  /**
   * Puts the caret, focused, at a position of the document with its pages joined whole, and tells
   * whether the position is in a text block.
   */
  caretAtJoined(at: number): boolean;
}

/** Where a caret went at a fragment boundary. */
export interface FragmentCaret {
  /** The split element's id. */
  readonly elementId: string;
  /** The caret's position in the document with its pages joined whole, as the web layout shows it. */
  readonly joined: number;
}

/** The text a stored document holds, in order, without separators. */
export function storedText(nodes: readonly StoredNode[]): string {
  return nodes.map((node) => (node.text ?? '') + storedText(node.content ?? [])).join('');
}

/** How many stored elements, nodes carrying an id, a stored document holds. */
export function storedElements(nodes: readonly StoredNode[]): number {
  return nodes.reduce(
    (count, node) =>
      count + (node.attrs?.id === undefined ? 0 : 1) + storedElements(node.content ?? []),
    0,
  );
}

const isPlaceholder = (node: ProseMirrorNode) =>
  node.type.name === 'paragraph' && node.content.size === 0 && !node.attrs.dataId;

const isContinuation = (node: ProseMirrorNode) => Number(node.attrs.splitPartIndex ?? 0) > 0;

// The first continuation of a type and where it starts.
function firstContinuation(doc: ProseMirrorNode, type: string) {
  let found: { node: ProseMirrorNode; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name === type && isContinuation(node)) found = { node, pos };
    return !found;
  });
  return found as { node: ProseMirrorNode; pos: number } | null;
}

// The first or last text position inside a node at a position.
function textEdge(doc: ProseMirrorNode, from: number, to: number, last: boolean): number | null {
  let at: number | null = null;
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    // A continuation's placeholder paragraph takes no room: the writer's caret cannot go there.
    if (isPlaceholder(node)) return false;
    if (last) at = pos + node.nodeSize - 1;
    else at ??= pos + 1;
    return false;
  });
  return at;
}

// The fragment of the same element just before a continuation, on the page before.
function headOf(doc: ProseMirrorNode, continuation: { node: ProseMirrorNode; pos: number }) {
  let head: { node: ProseMirrorNode; pos: number } | null = null;
  doc.nodesBetween(0, continuation.pos, (node, pos) => {
    const before = pos + node.nodeSize <= continuation.pos;
    if (
      before &&
      node.type === continuation.node.type &&
      node.attrs.dataId === continuation.node.attrs.dataId
    )
      head = { node, pos };
    return !node.isTextblock;
  });
  return head as { node: ProseMirrorNode; pos: number } | null;
}

// The size of the leading rows of a table's continuation that repeat its head's header rows.
function repeatedHeaderSize(head: ProseMirrorNode, continuation: ProseMirrorNode): number {
  if (head.type.name !== 'table') return 0;
  let size = 0;
  for (let index = 0; index < Math.min(head.childCount, continuation.childCount); index += 1) {
    const row = head.child(index);
    const isHeader =
      row.childCount > 0 && row.content.content.every((cell) => cell.type.name === 'table_header');
    if (!isHeader || !row.eq(continuation.child(index))) break;
    size += row.nodeSize;
  }
  return size;
}

function placeCaret(view: EditorView, at: number) {
  const { doc } = view.state;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, at)).scrollIntoView());
  view.focus();
}

// The caret at a fragment boundary of the pages the view shows: on its own paged state, or on the
// canonical state a projection shows on pages, at the boundary's place in the whole document.
function caretAtFragment(view: EditorView, type: string, edge: FragmentEdge): FragmentCaret | null {
  const doc = pageMap(view.state).projection;
  const continuation = firstContinuation(doc, type);
  if (!continuation) return null;
  const head = headOf(doc, continuation);
  const target = edge === 'continuation-start' ? continuation : head;
  if (!target) return null;
  // A table's continuation starts after the header rows it repeats, which are its head's own.
  const from =
    edge === 'continuation-start' && head
      ? target.pos + 1 + repeatedHeaderSize(head.node, target.node)
      : target.pos;
  const at = textEdge(doc, from, target.pos + target.node.nodeSize, edge === 'head-end');
  if (at === null) return null;
  const joined = joinDocumentPages(doc).mapping.map(at, edge === 'head-end' ? -1 : 1);
  placeCaret(view, doc === view.state.doc ? at : joined);
  const id: unknown = continuation.node.attrs.dataId;
  return { elementId: typeof id === 'string' ? id : '', joined };
}

/** Puts the probe on `window.regressionLab` while the lab shows. */
export function useRegressionProbe(handle: RefObject<DocumentEditorHandle | null>) {
  useEffect(() => {
    const probe: RegressionProbe = {
      stored: () => {
        const view = handle.current?.view();
        return view ? writeDocumentFile(view.state.doc) : null;
      },
      caretAtFragment: (type, edge) => {
        const view = handle.current?.view();
        return view ? caretAtFragment(view, type, edge) : null;
      },
      caretAtJoined: (at) => {
        const view = handle.current?.view();
        if (!view || at > view.state.doc.content.size) return false;
        placeCaret(view, at);
        return view.state.doc.resolve(at).parent.isTextblock;
      },
    };
    Object.assign(window, { regressionLab: probe });
  }, [handle]);
}
