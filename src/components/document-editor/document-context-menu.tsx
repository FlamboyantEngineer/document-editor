// The editor's context menu, everywhere in the document: a secondary click opens it at the pointer,
// after moving the selection there unless the click is inside it, and Shift+F10 or the Context Menu
// key opens it at the caret. Its entries are built for the selection when it opens.

import {
  ContextMenu,
  type MenuController,
  type MenuPoint,
  useMenuController,
} from '@flamboyantengineer/ui-components/context-menu';
import { type EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react';
import { PROOFING_ISSUE_ATTR } from '../../engine/index.js';
import { isFocusLost } from '../../utils/composed-focus.js';
import { showViewSelection } from '../../utils/dom-selection.js';
import { isElement } from '../../utils/is-element.js';
import type { ContextEntriesOptions } from './context-entries.js';
import { composeContextMenu, type DocumentContextMenuOptions } from './context-providers.js';
import { resolveContextTarget } from './context-target.js';
import { createEditorContext, type EditorContextOptions } from './editor-context.js';
import type { EditorSession } from './save-status-item.js';

interface DocumentContextMenuProps extends Omit<ContextEntriesOptions, 'startComment'> {
  view: EditorView | null;
  /** The host's state and session, even when the view is a projection. */
  documentState: EditorState;
  session: EditorSession | undefined;
  /** Holds the comments margin's way to start a thread, while the reader may comment. */
  startCommentRef: RefObject<(() => void) | null>;
  /** The host's providers and arrangement. */
  options: DocumentContextMenuOptions;
  /**
   * What the context handed to the providers says of the editor beside its view and state: its
   * mode, markup, layout and zoom, and how it opens a dialog.
   */
  shown: EditorContextOptions;
}

/** What the host provides that the context menu offers: linked code and abbreviations. */
export const contextFeatures = (props: { codeSource?: unknown; glossary?: unknown }) => ({
  linkedCode: Boolean(props.codeSource),
  glossary: Boolean(props.glossary),
});

// Whether a document position is inside the selection, a selected cell included.
function isSelected(view: EditorView, pos: number): boolean {
  const { selection } = view.state;
  if (selection instanceof CellSelection) {
    return selection.ranges.some((range) => range.$from.pos <= pos && pos <= range.$to.pos);
  }
  return !selection.empty && selection.from <= pos && pos <= selection.to;
}

// Moves the selection to where a secondary click landed, unless it landed inside the selection;
// returns the position it landed on. The caret the browser put down at the press, which the view
// reads late, gives way to that selection: read by a render that keeps the state, it would move the
// selection off what the click landed on before the menu opens (on a figure's image, to before the
// figure).
function selectAt(view: EditorView, point: { left: number; top: number }) {
  const hit = view.posAtCoords(point);
  const head = view.state.selection.head;
  if (!hit || isSelected(view, hit.pos)) {
    showViewSelection(view);
    return { pos: hit?.pos ?? head };
  }
  const { doc } = view.state;
  const node = hit.inside >= 0 ? doc.nodeAt(hit.inside) : null;
  const selection =
    node && node.isAtom && NodeSelection.isSelectable(node)
      ? NodeSelection.create(doc, hit.inside)
      : TextSelection.near(doc.resolve(hit.pos));
  if (!selection.eq(view.state.selection)) view.dispatch(view.state.tr.setSelection(selection));
  showViewSelection(view);
  return { pos: hit.pos };
}

// The text selection a secondary click outside it moves away from, which a comment started from the
// menu still takes whole; none when the click lands inside it.
function selectionLeft(view: EditorView, point: { left: number; top: number }) {
  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || selection.empty) return null;
  const hit = view.posAtCoords(point);
  return hit && !isSelected(view, hit.pos) ? { selection, doc: view.state.doc } : null;
}

// Starts the comment on the selection a click moved away from, while the document is as it was.
function commentOnLeft(
  view: EditorView,
  left: ReturnType<typeof selectionLeft>,
  start: (() => void) | null,
) {
  if (!start || !left) return { startComment: start, commentState: null };
  const restore = () => view.state.tr.setSelection(left.selection);
  const same = () => view.state.doc === left.doc;
  return {
    commentState: same() ? view.state.apply(restore()) : null,
    startComment: () => {
      if (same()) view.dispatch(restore());
      start();
    },
  };
}

// Whether a pointer event landed on a proofing issue's mark.
function onProofingMark(target: EventTarget | null): boolean {
  const node = target as Node | null;
  const element = node?.nodeType === 1 ? (node as Element) : (node?.parentElement ?? null);
  return element?.closest(`[${PROOFING_ISSUE_ATTR}]`) != null;
}

const isMenuKey = (event: KeyboardEvent) =>
  event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);

// Once the menu closes, the document takes focus back when nothing else has it, as when the menu
// closes before the focus it took could be handed back.
function useFocusAfterClose(view: EditorView | null, controller: MenuController) {
  useEffect(() => {
    const owner = view?.dom.ownerDocument.defaultView;
    if (!view || !owner) return undefined;
    let open = controller.isOpen();
    let timer = 0;
    const unsubscribe = controller.subscribe(() => {
      const wasOpen = open;
      open = controller.isOpen();
      if (!wasOpen || open) return;
      owner.clearTimeout(timer);
      timer = owner.setTimeout(() => {
        if (view.isDestroyed) return;
        if (!controller.isOpen() && isFocusLost(owner.document)) view.focus();
      }, 250);
    });
    return () => {
      unsubscribe();
      owner.clearTimeout(timer);
    };
  }, [view, controller]);
}

/** Where an open menu sits against the content it opened on. */
interface MenuHold {
  readonly element: Element;
  readonly dx: number;
  readonly dy: number;
}

// The element of the content at a document position, which an open menu moves with.
function contentElementAt(view: EditorView, pos: number): Element | null {
  try {
    const { node } = view.domAtPos(pos);
    return node.nodeType === node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  } catch {
    return null;
  }
}

// How an open menu holds on to the content it opened on: as the document scrolls, the menu moves
// with that content, staying open.
function holdAt(view: EditorView, anchor: MenuPoint, pos: number): MenuHold | null {
  const element = contentElementAt(view, pos);
  if (!element) return null;
  const box = element.getBoundingClientRect();
  return { element, dx: anchor.x - box.left, dy: anchor.y - box.top };
}

// Moves the open menu with the content it opened on as anything scrolls.
function useMenuFollowsContent(
  view: EditorView | null,
  controller: MenuController,
  holdRef: RefObject<MenuHold | null>,
) {
  useEffect(() => {
    const owner = view?.dom.ownerDocument;
    if (!owner) return undefined;
    const follow = () => {
      const hold = holdRef.current;
      if (!hold || !controller.isOpen() || !hold.element.isConnected) return;
      const box = hold.element.getBoundingClientRect();
      controller.move({ x: box.left + hold.dx, y: box.top + hold.dy });
    };
    owner.addEventListener('scroll', follow, { capture: true, passive: true });
    return () => owner.removeEventListener('scroll', follow, { capture: true });
  }, [view, controller, holdRef]);
}

// What the menu opens on; from the pointer, the proofing entries show only on an issue's mark the
// view draws.
function targetAt(
  state: EditorState,
  pos: number,
  { editable, mark }: { editable: boolean; mark?: boolean | undefined },
) {
  const resolved = resolveContextTarget(state, pos, editable);
  if (mark === undefined) return resolved;
  return { ...resolved, proofingIssue: mark ? resolved.proofingIssue : null, proofingMark: mark };
}

function useMenuInputs(props: DocumentContextMenuProps) {
  const { view, documentState, session, editable } = props;
  const { doc, plugins } = documentState;
  const latestRef = useRef(props);
  const clipboardTargetRef = useRef({ view, doc, plugins, session, editable });
  useEffect(() => {
    latestRef.current = props;
  });
  // Transactions that only update plugin metadata keep the document and its configuration.
  useLayoutEffect(() => {
    clipboardTargetRef.current = { view, doc, plugins, session, editable };
  }, [view, doc, plugins, session, editable]);
  return { latestRef, clipboardTargetRef };
}

function keepClipboardTarget(target: RefObject<unknown>) {
  const original = target.current;
  return () => target.current === original;
}

/** Opens the editor's context menu on the document of `view`. */
export function DocumentContextMenu(props: DocumentContextMenuProps) {
  const { view } = props;
  const controller = useMenuController();
  const holdRef = useRef<MenuHold | null>(null);
  const { latestRef, clipboardTargetRef } = useMenuInputs(props);
  useEffect(() => {
    const owner = view?.dom.ownerDocument.defaultView;
    if (!view || !owner) return undefined;
    // The opening that waits for the button's release or the next frame, cancelled on unmount.
    const pending = { cancel: () => undefined as void };
    let frame = 0;
    const show = (
      anchor: MenuPoint,
      pos: number,
      { mark, left = null }: { mark?: boolean; left?: ReturnType<typeof selectionLeft> } = {},
    ) => {
      const { startCommentRef, options: menu, shown, ...options } = latestRef.current;
      const { state } = view;
      const target = targetAt(state, pos, { editable: options.editable, mark });
      // The providers get the editor as its other controls see it, on the state the menu opens
      // on; at a locked position the writer cannot edit.
      const context = createEditorContext(view, state, {
        ...shown,
        editable: options.editable && !target.locked,
      });
      const entries = {
        ...options,
        ...commentOnLeft(view, left, startCommentRef.current),
        isClipboardCurrent: keepClipboardTarget(clipboardTargetRef),
      };
      const items = composeContextMenu(view, target, { context, entries, menu });
      if (items.length === 0) return;
      holdRef.current = holdAt(view, anchor, pos);
      controller.open(anchor, { items });
    };
    // Whether the host keeps the selection on a secondary click there; its press then moves no
    // caret.
    const keeps = (event: MouseEvent) =>
      isElement(event.target) && latestRef.current.options.keepSelection?.(event.target) === true;
    const onMouseDown = (event: MouseEvent) => {
      if (event.button === 2 && keeps(event)) event.preventDefault();
    };
    const onContextMenu = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      const anchor = { x: event.clientX, y: event.clientY };
      const mark = onProofingMark(event.target);
      const point = { left: event.clientX, top: event.clientY };
      const left = keeps(event) ? null : selectionLeft(view, point);
      const { pos } = keeps(event) ? { pos: view.state.selection.head } : selectAt(view, point);
      // A moved selection reaches the view once the editor commits it, a frame later. Where the
      // menu opens on the press, it opens once the button is released, or the release would land
      // outside the menu just opened and close it.
      pending.cancel();
      const open = () => {
        owner.removeEventListener('mouseup', open, true);
        frame = owner.requestAnimationFrame(() => show(anchor, pos, { mark, left }));
      };
      pending.cancel = () => {
        owner.removeEventListener('mouseup', open, true);
        owner.cancelAnimationFrame(frame);
      };
      if (event.buttons === 0) open();
      else owner.addEventListener('mouseup', open, { once: true, capture: true });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isMenuKey(event) || event.defaultPrevented) return;
      event.preventDefault();
      const { head } = view.state.selection;
      const caret = view.coordsAtPos(head);
      show({ x: caret.left, y: caret.bottom }, head);
    };
    view.dom.addEventListener('mousedown', onMouseDown, true);
    view.dom.addEventListener('contextmenu', onContextMenu);
    view.dom.addEventListener('keydown', onKeyDown);
    return () => {
      pending.cancel();
      view.dom.removeEventListener('mousedown', onMouseDown, true);
      view.dom.removeEventListener('contextmenu', onContextMenu);
      view.dom.removeEventListener('keydown', onKeyDown);
    };
  }, [view, controller, latestRef, clipboardTargetRef]);
  useFocusAfterClose(view, controller);
  useMenuFollowsContent(view, controller, holdRef);
  return <ContextMenu controller={controller} aria-label={props.labels.contextMenu} isNonModal />;
}
