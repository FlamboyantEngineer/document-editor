// The editor's context menu, everywhere in the document: a secondary click opens it at the pointer,
// after moving the selection there unless the click is inside it, and Shift+F10 or the Context Menu
// key opens it at the caret. Its entries are built for the selection when it opens.

import {
  ContextMenu,
  type MenuController,
  type MenuPoint,
  useMenuController,
} from '@flamboyantengineer/ui-components/context-menu';
import { NodeSelection, TextSelection } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import { type RefObject, useEffect, useRef } from 'react';
import { isFocusLost } from '../../utils/composed-focus.js';
import type { ContextEntriesOptions } from './context-entries.js';
import { composeContextMenu, type DocumentContextMenuOptions } from './context-providers.js';
import { resolveContextTarget } from './context-target.js';
import { createEditorContext, type EditorContextOptions } from './editor-context.js';

interface DocumentContextMenuProps extends Omit<ContextEntriesOptions, 'startComment'> {
  view: EditorView | null;
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

// Whether a document position is inside the selection, a selected cell included.
function isSelected(view: EditorView, pos: number): boolean {
  const { selection } = view.state;
  if (selection instanceof CellSelection) {
    return selection.ranges.some((range) => range.$from.pos <= pos && pos <= range.$to.pos);
  }
  return !selection.empty && selection.from <= pos && pos <= selection.to;
}

// Moves the selection to where a secondary click landed, unless it landed inside the selection;
// returns the position it landed on.
function selectAt(view: EditorView, point: { left: number; top: number }) {
  const hit = view.posAtCoords(point);
  const head = view.state.selection.head;
  if (!hit || isSelected(view, hit.pos)) return { pos: hit?.pos ?? head };
  const { doc } = view.state;
  const node = hit.inside >= 0 ? doc.nodeAt(hit.inside) : null;
  const selection =
    node && node.isAtom && NodeSelection.isSelectable(node)
      ? NodeSelection.create(doc, hit.inside)
      : TextSelection.near(doc.resolve(hit.pos));
  if (!selection.eq(view.state.selection)) view.dispatch(view.state.tr.setSelection(selection));
  return { pos: hit.pos };
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
    return controller.subscribe(() => {
      const wasOpen = open;
      open = controller.isOpen();
      if (!wasOpen || open) return;
      owner.setTimeout(() => {
        if (!controller.isOpen() && isFocusLost(owner.document)) view.focus();
      }, 250);
    });
  }, [view, controller]);
}

/** Opens the editor's context menu on the document of `view`. */
export function DocumentContextMenu(props: DocumentContextMenuProps) {
  const { view } = props;
  const controller = useMenuController();
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });
  useEffect(() => {
    const owner = view?.dom.ownerDocument.defaultView;
    if (!view || !owner) return undefined;
    const show = (anchor: MenuPoint, pos: number) => {
      const { startCommentRef, options: menu, shown, ...options } = latest.current;
      const { state } = view;
      const target = resolveContextTarget(state, pos, options.editable);
      // The providers get the editor as its other controls see it, on the state the menu opens
      // on; at a locked position the writer cannot edit.
      const context = createEditorContext(view, state, {
        ...shown,
        editable: options.editable && !target.locked,
      });
      const entries = { ...options, startComment: startCommentRef.current };
      const items = composeContextMenu(view, target, { context, entries, menu });
      if (items.length > 0) controller.open(anchor, { items });
    };
    const onContextMenu = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      const anchor = { x: event.clientX, y: event.clientY };
      const { pos } = selectAt(view, { left: event.clientX, top: event.clientY });
      // A moved selection reaches the view once the editor commits it, a frame later. Where the
      // menu opens on the press, it opens once the button is released, or the release would land
      // outside the menu just opened and close it.
      const open = () => owner.requestAnimationFrame(() => show(anchor, pos));
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
    view.dom.addEventListener('contextmenu', onContextMenu);
    view.dom.addEventListener('keydown', onKeyDown);
    return () => {
      view.dom.removeEventListener('contextmenu', onContextMenu);
      view.dom.removeEventListener('keydown', onKeyDown);
    };
  }, [view, controller]);
  useFocusAfterClose(view, controller);
  return <ContextMenu controller={controller} aria-label={props.labels.contextMenu} isNonModal />;
}
