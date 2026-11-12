// The editor's handle, for a host that drives it from outside: focusing it, taking the reader to an
// element, selecting by element id, running a command or a batch of automation edits.

import { type Command, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { type Ref, type RefObject, useImperativeHandle, useMemo, useRef } from 'react';
import { type FoundElement, textRange } from '../../engine/automation-address.js';
import {
  applyEdits,
  type AutomationEdit,
  type AutomationOptions,
  type AutomationResult,
  commentAnchors,
  documentSnapshot,
  type EditAddress,
  revealElement,
  type RevealOptions,
  type SnapshotOptions,
} from '../../engine/index.js';
import type { TemplateFile } from '../../model/index.js';
import type { LayoutState, PaginationStats } from '../../pagination/index.js';
import type {
  OpenComment,
  StartComment,
  StartCommentOptions,
} from '../document-comments/document-comments.js';
import type { LayoutProgress } from './use-document-layout.js';

/** Where `openThread` takes the reader within a thread. */
export interface OpenThreadOptions {
  /** The comment to point the reader at, such as the one a link names. */
  readonly entryId?: string | undefined;
  /** A reply to start writing in the thread's composer. */
  readonly reply?: string | undefined;
}

/** What a host can do with a mounted editor. */
export interface DocumentEditorHandle {
  /** The engine's view, once it is mounted. */
  readonly view: () => EditorView | null;
  /** Moves focus into the document. */
  focus(): void;
  /** Puts the caret at an element's start and scrolls it into view; false when it is not there. */
  scrollToElement(elementId: string): boolean;
  /**
   * Takes the reader to an element: scrolls it to the top of the view, smoothly, without moving
   * the selection unless asked (`revealElement`); false when it is not there.
   */
  revealElement(elementId: string, options?: RevealOptions): boolean;
  /** Selects a range of an element's text, or the whole element; false when it cannot. */
  select(address: EditAddress): boolean;
  /**
   * Opens a comment thread: puts the caret in its anchor and centres it, makes its card the active
   * one in the margin and the comments panel, shown whatever their filter, points at `entryId`'s
   * comment and starts `reply` in its composer; false when neither the document anchors it nor the
   * comments hold it.
   */
  openThread(threadId: string, options?: OpenThreadOptions): boolean;
  /**
   * Starts a comment thread on the selected text, or the caret's block, its opening comment
   * beginning with `text`, while the editor shows comments and the reader may comment; false
   * otherwise.
   */
  startComment(options?: StartCommentOptions): boolean;
  /**
   * The document as its pages show it now, as a standalone HTML document a host prints or turns
   * into a PDF (`documentSnapshot`); null before the editor is mounted.
   */
  exportSnapshot(options?: Omit<SnapshotOptions, 'template'>): string | null;
  /** Runs a command on the latest state; false when it does not apply. */
  run(command: Command): boolean;
  /** Applies a batch of automation edits (DOCE-AUTOMATION) and dispatches it when it is accepted. */
  applyEdits(edits: readonly AutomationEdit[], options: AutomationOptions): AutomationResult | null;
  /**
   * Resolves once the pages are laid out with no layout due and the views that follow them have
   * drawn: with `settled`, or `failed` when they could not be laid out. At once in the web layout.
   */
  whenSettled(): Promise<LayoutState>;
  /** What the page layouts have done (`PaginationStats`); null in the web layout. */
  layoutStats(): PaginationStats | null;
}

// The document range an address names in the view's document: a range of a text block's text, or
// the start of another element. An element the pages split is read in its first part.
function rangeOf(view: EditorView, address: EditAddress) {
  let found: FoundElement | null = null;
  view.state.doc.descendants((node, pos) => {
    if (found) return false;
    if (node.attrs.dataId === address.elementId) found = { node, pos };
    return !found;
  });
  const element = found as FoundElement | null;
  if (!element) return null;
  if (!element.node.isTextblock) return { from: element.pos + 1, to: element.pos + 1 };
  return textRange(element, address);
}

// Selects what an address names in the view and scrolls it into view.
function selectIn(view: EditorView | null, address: EditAddress): boolean {
  if (!view) return false;
  const range = rangeOf(view, address);
  if (!range) return false;
  const { doc } = view.state;
  const selection =
    range.from === range.to
      ? TextSelection.near(doc.resolve(range.from))
      : TextSelection.create(doc, range.from, range.to);
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  view.focus();
  return true;
}

// Puts the caret in a thread's anchor and centres its text in view.
function placeInThread(view: EditorView, threadId: string): boolean {
  const anchor = commentAnchors(view.state).find((each) => each.thread === threadId);
  if (!anchor) return false;
  const selection = TextSelection.create(view.state.doc, anchor.from);
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  // The anchor's text, centred: a text node's parent, since only elements scroll into view.
  const { node } = view.domAtPos(anchor.from);
  const element = node.nodeType === node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  element?.scrollIntoView?.({ block: 'center' });
  view.focus();
  return true;
}

/** Where the comments give the editor and its handle their ways in. */
export interface CommentRefs {
  readonly startCommentRef: RefObject<StartComment | null>;
  readonly openThreadRef: RefObject<OpenComment | null>;
}

/** The refs the comments fill with their ways in. */
export function useCommentRefs(): CommentRefs {
  const startCommentRef = useRef<StartComment | null>(null);
  const openThreadRef = useRef<OpenComment | null>(null);
  return useMemo(() => ({ startCommentRef, openThreadRef }), []);
}

/** Gives the host a handle on the editor through its `handleRef`. */
export function useEditorHandle(
  ref: Ref<DocumentEditorHandle> | undefined,
  view: EditorView | null,
  {
    startCommentRef,
    openThreadRef,
    template,
    layout,
  }: CommentRefs & {
    template: TemplateFile;
    layout: LayoutProgress;
  },
) {
  useImperativeHandle(
    ref,
    () => ({
      view: () => view,
      focus: () => view?.focus(),
      scrollToElement: (elementId) => selectIn(view, { elementId, from: 0, to: 0 }),
      revealElement: (elementId, options) =>
        view ? revealElement(view, elementId, options) : false,
      select: (address) => selectIn(view, address),
      openThread: (threadId, options) => {
        const placed = view ? placeInThread(view, threadId) : false;
        const opened = openThreadRef.current?.({ threadId, ...options }) ?? false;
        return placed || opened;
      },
      exportSnapshot: (options) => (view ? documentSnapshot(view, { ...options, template }) : null),
      startComment: (options) => {
        const start = startCommentRef.current;
        start?.(options);
        return Boolean(start);
      },
      run(command) {
        if (!view) return false;
        const ran = command(view.state, view.dispatch, view);
        view.focus();
        return ran;
      },
      applyEdits(edits, options) {
        if (!view) return null;
        const result = applyEdits(view.state, edits, options);
        if (result.ok) view.dispatch(result.tr);
        return result;
      },
      whenSettled: layout.whenSettled,
      layoutStats: layout.stats,
    }),
    [view, startCommentRef, openThreadRef, template, layout],
  );
}
