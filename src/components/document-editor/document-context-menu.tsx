// The editor's context menu, everywhere in the document: a secondary click opens it at the pointer,
// after moving the selection there unless the click is inside it, and Shift+F10 or the Context Menu
// key opens it at the caret. Its entries are built for the selection when it opens.

import {
  ContextMenu,
  type MenuPoint,
  useMenuController,
} from '@flamboyantengineer/ui-components/context-menu';
import { NodeSelection, TextSelection } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import { type RefObject, useEffect, useRef } from 'react';
import type { ContextEntriesOptions } from './context-entries.js';
import { composeContextMenu, type DocumentContextMenuOptions } from './context-providers.js';
import { resolveContextTarget } from './context-target.js';
import { createEditorContext } from './editor-context.js';

interface DocumentContextMenuProps extends Omit<ContextEntriesOptions, 'startComment'> {
  view: EditorView | null;
  /** Holds the comments margin's way to start a thread, while the reader may comment. */
  startCommentRef: RefObject<(() => void) | null>;
  /** The host's providers and arrangement. */
  options: DocumentContextMenuOptions;
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
// returns the position it landed on and whether the selection moved.
function selectAt(view: EditorView, point: { left: number; top: number }) {
  const hit = view.posAtCoords(point);
  const head = view.state.selection.head;
  if (!hit || isSelected(view, hit.pos)) return { pos: hit?.pos ?? head, moved: false };
  const { doc } = view.state;
  const node = hit.inside >= 0 ? doc.nodeAt(hit.inside) : null;
  const selection =
    node && node.isAtom && NodeSelection.isSelectable(node)
      ? NodeSelection.create(doc, hit.inside)
      : TextSelection.near(doc.resolve(hit.pos));
  if (selection.eq(view.state.selection)) return { pos: hit.pos, moved: false };
  view.dispatch(view.state.tr.setSelection(selection));
  return { pos: hit.pos, moved: true };
}

const isMenuKey = (event: KeyboardEvent) =>
  event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);

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
      const { startCommentRef, options: menu, ...options } = latest.current;
      const { state } = view;
      const target = resolveContextTarget(state, pos, options.editable);
      const context = createEditorContext(view, state, {
        editable: options.editable && !target.locked,
        labels: options.labels,
      });
      const entries = { ...options, startComment: startCommentRef.current };
      const items = composeContextMenu(view, target, { context, entries, menu });
      if (items.length > 0) controller.open(anchor, { items });
    };
    const onContextMenu = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      const anchor = { x: event.clientX, y: event.clientY };
      // A moved selection reaches the view once the editor commits it, a frame later.
      const { pos, moved } = selectAt(view, { left: event.clientX, top: event.clientY });
      if (moved) owner.requestAnimationFrame(() => show(anchor, pos));
      else show(anchor, pos);
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
  return <ContextMenu controller={controller} aria-label={props.labels.contextMenu} isNonModal />;
}
