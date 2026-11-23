// The editor's handle, for a host that drives it from outside: focusing it, taking the reader to an
// element, selecting by element id, running a command, a batch of automation edits or an action of
// the host's provider on the selected text.

import type { Attrs } from 'prosemirror-model';
import { type Command, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { type Ref, type RefObject, useImperativeHandle, useMemo, useRef } from 'react';
import { fontFaceRules } from '../../document/font-faces.js';
import type { PagesLayout } from '../../document/pages-layout.js';
import { type FoundElement, textRange } from '../../engine/automation-address.js';
import {
  applyEdits,
  type AutomationEdit,
  type AutomationOptions,
  type AutomationResult,
  commentAnchors,
  documentSnapshot,
  type EditAddress,
  isActive,
  type ReadySnapshotOptions,
  revealElement,
  type RevealOptions,
  runSelectionAction,
  type SelectionActionOptions,
  type SelectionActionResult,
  type SnapshotOptions,
  snapshotOutline,
  type SnapshotOutlineEntry,
} from '../../engine/index.js';
import { snapshotOnceReady } from '../../engine/snapshot-ready.js';
import type { ReferenceSourceAdapter, SelectionActionsAdapter } from '../../host/index.js';
import type { SuggestionMarkup } from '../../layout-engine/hidden-suggestions.js';
import type { TemplateFile } from '../../model/index.js';
import type { CitationHref } from '../../model/schema/reference-mark.js';
import type { LayoutState, PageTextLines, PaginationStats } from '../../pagination/index.js';
import { keepCentred } from '../../utils/keep-centred.js';
import type {
  CommentPointer,
  OpenComment,
  StartComment,
  StartCommentOptions,
} from '../document-comments/document-comments.js';
import type { EditorPanes, RevealPaneOptions } from '../document-panels/document-panels.js';
import type { FindBarMode } from './document-find-bar.js';
import type { LayoutProgress } from './layout-progress.js';
import {
  measureVisibleElements,
  measureVisiblePages,
  type VisibleElement,
  type VisiblePage,
} from './visible-elements.js';

/** Where `openThread` takes the reader within a thread. */
interface OpenThreadOptions {
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
   * Opens the find bar at its find box, or at its replacement with `replace`, seeded with the
   * selected text, while the editor has a find bar (`find`), or the side panel's search pane with
   * `find: 'pane'` while a panel holds it; false otherwise.
   */
  openFind(mode?: FindBarMode): boolean;
  /**
   * The document as its pages show it now, as a standalone HTML document a host prints or turns
   * into a PDF (`documentSnapshot`); null before the editor is mounted.
   */
  exportSnapshot(options?: Omit<SnapshotOptions, 'template'>): string | null;
  /**
   * The document as `exportSnapshot` gives it, once the pages are ready to print: laid out with
   * no layout due, in their fonts, with each image's address as `resolveImage` resolves it, which
   * may answer later (`documentSnapshotWhenReady`); null before the editor is mounted.
   */
  exportSnapshotAsync(
    options?: Omit<ReadySnapshotOptions, 'template' | 'whenSettled'>,
  ): Promise<string | null>;
  /** The headings as the pages show them now, for a printed document's bookmarks; empty unmounted. */
  snapshotOutline(): SnapshotOutlineEntry[];
  /** Runs a command on the latest state; false when it does not apply. */
  run(command: Command): boolean;
  /** Whether a command applies to the latest state, without running it; false unmounted. */
  can(command: Command): boolean;
  /**
   * Whether the mark or node of a schema name holds at the latest selection, with each of
   * `attrs` when given (`isActive`); false unmounted.
   */
  isActive(name: string, attrs?: Attrs): boolean;
  /** Applies a batch of automation edits (DOCE-AUTOMATION) and dispatches it when it is accepted. */
  applyEdits(edits: readonly AutomationEdit[], options: AutomationOptions): AutomationResult | null;
  /**
   * Asks the host's provider to act on the selected text and records its answer as the agent's
   * suggestions and comment threads (`runSelectionAction`); null before the editor is mounted.
   */
  runSelectionAction(
    adapter: SelectionActionsAdapter,
    options: SelectionActionOptions,
  ): Promise<SelectionActionResult | null>;
  /**
   * Resolves once the pages are laid out with no layout due and the views that follow them have
   * drawn: with `settled`, or `failed` when they could not be laid out. At once in the web layout.
   */
  whenSettled(): Promise<LayoutState>;
  /** What the page layouts have done (`PaginationStats`); null in the web layout. */
  layoutStats(): PaginationStats | null;
  /**
   * With `textLayout: 'pretext'`, the lines the layout engine computed for each page's top-level
   * paragraphs and headings, which the pages draw them on (DOCE-PAGINATION-11.3); none otherwise.
   */
  textLines(): PageTextLines[];
  /**
   * With `textLayout: 'pretext'`, the pages' layout as data: the pages' document, each forced
   * block's line marks and the variables as shown, which `renderPrintPage` and a viewer draw
   * without measuring (DOCE-PAGINATION-13.2); null otherwise. Laid out in the editor's markup, or
   * in `markup`, the suggestions it hides taking no room (DOCE-PAGINATION-11.12).
   */
  pagesLayout(options?: PagesLayoutRequest): PagesLayout | null;
  /**
   * With `textLayout: 'pretext'`, draws every page on the layout engine's lines, as for printing or
   * checking every page, or, given false, only the pages near the screen again
   * (DOCE-PAGINATION-11.6).
   */
  drawAllLines(all: boolean): void;
  /** The elements with an element id on screen now, with their boxes in the window. */
  visibleElements(): readonly VisibleElement[];
  /** The pages on screen now, each with its sheet and its content's box in the window. */
  visiblePages(): readonly VisiblePage[];
  /**
   * Shows a pane of the editor's side panels: selects it in the panel holding it, expands that
   * panel and, unless asked not to, moves focus into it; false when no panel holds it.
   */
  revealPane(paneId: string, options?: RevealPaneOptions): boolean;
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

// Puts the caret in a thread's anchor and centres its text in view, both ways, and again as the
// area around it changes width until the reader acts there (`keepCentred`); `stopCentring` holds
// what stops the centring of the thread opened before.
function placeInThread(
  view: EditorView,
  threadId: string,
  stopCentring: RefObject<(() => void) | null>,
): boolean {
  const anchor = commentAnchors(view.state).find((each) => each.thread === threadId);
  if (!anchor) return false;
  const selection = TextSelection.create(view.state.doc, anchor.from);
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  // The anchor's text, centred: a text node's parent, since only elements scroll into view.
  const { node } = view.domAtPos(anchor.from);
  const element = node.nodeType === node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  stopCentring.current?.();
  stopCentring.current = element ? keepCentred(element) : null;
  view.focus();
  return true;
}

/** Where the comments give the editor and its handle their ways in. */
export interface CommentRefs {
  readonly startCommentRef: RefObject<StartComment | null>;
  readonly openThreadRef: RefObject<OpenComment | null>;
  /** What the comments do with pointer presses and clicks in the document. */
  readonly commentPointerRef: RefObject<CommentPointer | null>;
}

/** The refs the comments fill with their ways in. */
export function useCommentRefs(): CommentRefs {
  const startCommentRef = useRef<StartComment | null>(null);
  const openThreadRef = useRef<OpenComment | null>(null);
  const commentPointerRef = useRef<CommentPointer | null>(null);
  return useMemo(() => ({ startCommentRef, openThreadRef, commentPointerRef }), []);
}

// Where the host links a printed citation: its references adapter's `href`, when it gives one.
const hrefOf = (references: ReferenceSourceAdapter | undefined): CitationHref | undefined =>
  references?.href ? (citation) => references.href?.(citation) ?? null : undefined;

// A snapshot's stylesheets, after the served faces the pages were measured and drawn with, under
// the families the pages draw them in too (DOCE-PAGINATION-12.8), so it prints in the glyphs its
// lines were broken in (DOCE-PAGINATION-13.8).
function servedStyles(layout: LayoutProgress, styles: readonly string[] | undefined) {
  const faces = fontFaceRules(layout.drawnFonts());
  return faces ? [faces, ...(styles ?? [])] : styles;
}

/** What a layout handed over is laid out for. */
export interface PagesLayoutRequest {
  /**
   * How it shows suggestions; by default as the editor shows them, its simple markup as `final`.
   * The pages are laid out in it for that moment, the suggestions it hides taking no room.
   */
  readonly markup?: SuggestionMarkup | undefined;
}

// Takes something of the pages laid out in a markup, when one is asked for.
const inMarkupOf =
  <T>(layout: LayoutProgress, markup: SuggestionMarkup | undefined) =>
  (take: () => T): T =>
    markup ? layout.inMarkup(markup, take) : take();

// The handle's snapshots of the view as it shows now.
function snapshotMethods(
  view: EditorView | null,
  {
    template,
    references,
    layout,
  }: {
    template: TemplateFile;
    references: ReferenceSourceAdapter | undefined;
    layout: LayoutProgress;
  },
): Pick<DocumentEditorHandle, 'exportSnapshot' | 'exportSnapshotAsync' | 'snapshotOutline'> {
  const citationHref = hrefOf(references);
  return {
    // Every page is drawn on the layout engine's lines while the snapshot is taken.
    // In the snapshot's markup, its pages are laid out in it while it is taken.
    exportSnapshot: (options) =>
      view
        ? allLines(layout, () =>
            inMarkupOf<string>(
              layout,
              options?.markup,
            )(() =>
              documentSnapshot(view, {
                citationHref,
                ...options,
                styles: servedStyles(layout, options?.styles),
                template,
              }),
            ),
          )
        : null,
    exportSnapshotAsync: async (options) =>
      view
        ? allLines(layout, () =>
            snapshotOnceReady(
              view,
              {
                citationHref,
                ...options,
                styles: servedStyles(layout, options?.styles),
                template,
                whenSettled: layout.whenSettled,
              },
              inMarkupOf(layout, options?.markup),
            ),
          )
        : null,
    snapshotOutline: () => (view ? snapshotOutline(view, template) : []),
  };
}

// Runs `take` with every page drawn on the layout engine's lines (DOCE-PAGINATION-11.6), and lets
// the pages near the screen come back once it is done, unless the host or another snapshot still
// asks for every page.
function allLines<T>(layout: LayoutProgress, take: () => T): T {
  const release = layout.holdAllLines();
  let async = false;
  try {
    const result = take();
    if (result instanceof Promise) {
      async = true;
      return result.finally(release) as T;
    }
    return result;
  } finally {
    if (!async) release();
  }
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
    panes,
    openFind,
    references,
  }: CommentRefs & {
    template: TemplateFile;
    references: ReferenceSourceAdapter | undefined;
    layout: LayoutProgress;
    panes: EditorPanes;
    openFind: ((mode?: FindBarMode) => boolean) | null;
  },
) {
  const stopCentring = useRef<(() => void) | null>(null);
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
        const placed = view ? placeInThread(view, threadId, stopCentring) : false;
        const opened = openThreadRef.current?.({ threadId, ...options }) ?? false;
        return placed || opened;
      },
      ...snapshotMethods(view, { template, references, layout }),
      startComment: (options) => {
        const start = startCommentRef.current;
        start?.(options);
        return Boolean(start);
      },
      openFind: (mode) => openFind?.(mode) ?? false,
      run(command) {
        if (!view) return false;
        const ran = command(view.state, view.dispatch, view);
        view.focus();
        return ran;
      },
      can: (command) => (view ? command(view.state, undefined, view) : false),
      isActive: (name, attrs) => (view ? isActive(view.state, name, attrs) : false),
      applyEdits(edits, options) {
        if (!view) return null;
        const result = applyEdits(view.state, edits, options);
        if (result.ok) view.dispatch(result.tr);
        return result;
      },
      runSelectionAction: async (adapter, options) =>
        view ? runSelectionAction(view, adapter, options) : null,
      whenSettled: layout.whenSettled,
      layoutStats: layout.stats,
      textLines: layout.textLines,
      pagesLayout: (options) =>
        inMarkupOf<PagesLayout | null>(layout, options?.markup)(layout.pagesLayout),
      drawAllLines: layout.drawAllLines,
      visibleElements: () => (view ? measureVisibleElements(view) : []),
      visiblePages: () => (view ? measureVisiblePages(view) : []),
      revealPane: (paneId, options) => panes.reveal(paneId, options),
    }),
    [view, startCommentRef, openThreadRef, template, layout, openFind, panes, references],
  );
}
