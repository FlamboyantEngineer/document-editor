// What the regression lab shows its scenarios (`e2e/regression.spec.ts`) on `window.regressionLab`:
// the document as it would be stored, a caret put at a split block's fragment boundary, and the
// pages as a snapshot for printing. The scenarios read pages from the page's DOM and the document
// from here, so they do not depend on how the editing state holds the pages.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { type RefObject, useEffect } from 'react';
import type { DocumentEditorHandle } from '../../../src/components/index.js';
import {
  type LayoutPrintOptions,
  type PagesLayout,
  renderLayoutPrintPage,
} from '../../../src/document/index.js';
import {
  type DocumentFile,
  joinDocumentPages,
  type StoredNode,
  type TemplateFile,
  writeDocumentFile,
} from '../../../src/model/index.js';
import {
  findWrappedLines,
  pageMap,
  type PageTextLines,
  type WrappedBlock,
} from '../../../src/pagination/index.js';
import { cousineFiles } from '../served-fonts.js';

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
  /** The pages as a snapshot for printing (`exportSnapshot`), or null before the editor shows. */
  snapshot(options?: SnapshotProbeOptions): string | null;
  /** The lines the layout engine computed for each page's text blocks. */
  textLines(): PageTextLines[];
  /** The forced blocks the browser drew on other lines (the guard). */
  wrappedLines(): WrappedBlock[];
  /**
   * The pages drawn from their layout without the editor
   * (`renderLayoutPrintPage`), as a standalone page; null without the engine.
   */
  layoutPrint(options?: LayoutPrintProbeOptions): string | null;
  /** Draws every page on the engine's lines, or only those near again. */
  drawAllLines(all: boolean): void;
  /**
   * Shows the pages' layout in the read-only viewer (`DocumentViewer`)
   * under the editor, drawing as many pages beyond the ones in view (all by default); false
   * without the engine.
   */
  showViewer(overscan?: number, markup?: LayoutMarkup): boolean;
  /**
   * Shows the pages' layout in two viewers at once, the second drawing Cousine's files under the
   * same families (DOCE-PAGINATION-12.8); false without the engine.
   */
  showTwoViewers(): Promise<boolean>;
  /** Keeps the first `count` viewers, taking the others away. */
  keepViewers(count: number): void;
  /** The selection, at positions of the document with its pages joined whole. */
  selected(): [number, number] | null;
  /** Gives the editor another fonts adapter while it shows (DOCE-PAGINATION-12.7). */
  setFonts(fonts: LabFonts): void;
  /** The pages' layout as data (`pagesLayout()`), or null. */
  layout(markup?: LayoutMarkup): PagesLayout | null;
  /**
   * Opens a stored document afresh, in a new editor, as if the page had just loaded it: on its
   * template, or on a template of the test's own resolved over the regression set's.
   */
  load(file: DocumentFile, template?: TemplateFile): void;
  /** Sets the document's zoom in percent while it shows. */
  setZoom(percent: number): void;
  /**
   * Where each text block's content is in the document with its pages joined whole, as `[from, to]`,
   * in order; continuation placeholders left out.
   */
  textRanges(): [number, number][];
  /** Selects, focused, between two positions of the document with its pages joined whole. */
  selectJoined(from: number, to: number): void;
  /** Makes a change as another writer would: outside the writer's undo history. */
  remote(change: RemoteChange): void;
}

/** A change another writer makes, at positions of the document with its pages joined whole. */
export type RemoteChange =
  | { readonly kind: 'insert'; readonly at: number; readonly text: string }
  | { readonly kind: 'delete'; readonly from: number; readonly to: number };

/** What the lab gives its probe besides the editor: how it opens a document and sets the zoom. */
export interface RegressionLabControls {
  readonly showViewer: ShowViewer;
  readonly setFonts: (fonts: LabFonts) => void;
  readonly keepViewers: (count: number) => void;
  readonly load: (file: DocumentFile, template?: TemplateFile) => void;
  readonly setZoom: (percent: number) => void;
}

/** Shows a layout in the lab's viewer, and more layouts in viewers after it. */
export type ShowViewer = (
  layout: PagesLayout,
  overscan: number,
  more?: readonly PagesLayout[],
) => void;

/**
 * The fonts adapter the lab gives its editor: none, the lab's, Cousine's files under every family,
 * or the lab's a second late.
 */
export type LabFonts = 'none' | 'lab' | 'cousine' | 'slow';

/** A markup the editor lays its pages out in for a layout it hands over (`pagesLayout`). */
type LayoutMarkup = 'all' | 'final' | 'original';

/** What the probe's layout print takes: the print's options, and the markup it is laid out in. */
export interface LayoutPrintProbeOptions extends LayoutPrintOptions {
  readonly markup?: LayoutMarkup | undefined;
}

/** What the probe's snapshot takes: the editor's snapshot options. */
export type SnapshotProbeOptions = Parameters<DocumentEditorHandle['exportSnapshot']>[0];

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
  const doc = pageMap(view.state, view).projection;
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

// Each text block's content range in a document, placeholders left out.
function textRanges(doc: ProseMirrorNode): [number, number][] {
  const ranges: [number, number][] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (!isPlaceholder(node)) ranges.push([pos + 1, pos + node.nodeSize - 1]);
    return false;
  });
  return ranges;
}

function remoteChange(view: EditorView, change: RemoteChange) {
  const { tr } = view.state;
  if (change.kind === 'insert') tr.insertText(change.text, change.at);
  else tr.delete(change.from, change.to);
  view.dispatch(tr.setMeta('addToHistory', false));
}

/** Puts the probe on `window.regressionLab` while the lab shows. */
export function useRegressionProbe(
  handle: RefObject<DocumentEditorHandle | null>,
  template: TemplateFile,
  { showViewer, load, setZoom, setFonts, keepViewers }: RegressionLabControls,
) {
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
      snapshot: (options) => handle.current?.exportSnapshot(options) ?? null,
      textLines: () => handle.current?.textLines() ?? [],
      wrappedLines: () => findWrappedLines(document),
      layoutPrint: ({ markup, ...options } = {}) => {
        const layout = handle.current?.pagesLayout({ markup });
        return layout ? renderLayoutPrintPage(layout, template, options) : null;
      },
      drawAllLines: (all) => handle.current?.drawAllLines(all),
      showViewer: (overscan = Infinity, markup) => {
        const layout = handle.current?.pagesLayout({ markup });
        if (layout) showViewer(layout, overscan);
        return Boolean(layout);
      },
      showTwoViewers: async () => {
        const layout = handle.current?.pagesLayout();
        if (!layout?.fonts) return false;
        showViewer(layout, Infinity, [{ ...layout, fonts: await cousineFiles(layout.fonts) }]);
        return true;
      },
      keepViewers,
      selected: () => {
        const selection = handle.current?.view()?.state.selection;
        return selection ? [selection.from, selection.to] : null;
      },
      setFonts,
      layout: (markup) => handle.current?.pagesLayout({ markup }) ?? null,
      load,
      setZoom,
      textRanges: () => {
        const view = handle.current?.view();
        return view ? textRanges(view.state.doc) : [];
      },
      selectJoined: (from, to) => {
        const view = handle.current?.view();
        if (!view) return;
        const { doc } = view.state;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, from, to)));
        view.focus();
      },
      remote: (change) => {
        const view = handle.current?.view();
        if (view) remoteChange(view, change);
      },
    };
    Object.assign(window, { regressionLab: probe });
  }, [handle, template, showViewer, load, setZoom, setFonts, keepViewers]);
}
