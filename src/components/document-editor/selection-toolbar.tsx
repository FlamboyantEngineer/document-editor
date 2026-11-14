// The floating toolbar over selected text: the character formats and the link, and a comment while
// the reader may comment, over the selection while the writer selects in the document. It never
// takes focus as it shows; Alt+F10 moves focus into it and Escape hides it until the selection
// changes, focus back in the document.

import { ChatBubblePlusGlyph } from '@flamboyantengineer/ui-components/core';
import { FloatingToolbar } from '@flamboyantengineer/ui-components/floating-toolbar';
import { type EditorState, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { canStartComment, shortcutsOf } from '../../engine/index.js';
import { createHooks } from '../../utils/hooks.js';
import { ToolbarItemGroups } from './document-toolbar.js';
import type { EditorContext } from './editor-context.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { markItems } from './format-items.js';
import { linkItem } from './insert-controls.js';
import {
  arrangeToolbar,
  type ToolbarButtonItem,
  type ToolbarGroup,
  type ToolbarItem,
} from './toolbar-items.js';

const hooks = createHooks('document-editor', ['selection-toolbar']);

/** How the host shapes the floating toolbar over selected text. */
export interface SelectionToolbarOptions {
  /** Items added to the toolbar's, each joining the group it names, as the toolbar's items do. */
  readonly items?: readonly ToolbarItem[] | undefined;
  /** Rearranges the groups once the items joined them: reorders, drops or regroups items. */
  readonly arrange?: ((groups: readonly ToolbarGroup[]) => readonly ToolbarGroup[]) | undefined;
}

/** The selection toolbar's own groups and the ids of their items. */
export const SELECTION_TOOLBAR_GROUPS = {
  marks: [
    'bold',
    'italic',
    'underline',
    'strikethrough',
    'code',
    'superscript',
    'subscript',
    'link',
  ],
  comment: ['comment'],
} as const;

// The comment item, shown while the reader may comment, as the context menu's.
function commentItem(
  labels: DocumentEditorLabels,
  startCommentRef: RefObject<(() => void) | null>,
): ToolbarButtonItem {
  return {
    kind: 'button',
    id: 'comment',
    label: labels.addComment,
    icon: ChatBubblePlusGlyph,
    run: () => startCommentRef.current?.(),
    isVisible: () => startCommentRef.current !== null,
    isEnabled: (context) => canStartComment(context.state),
  };
}

// The selected text's range, or null while nothing is selected or the selection is not text.
function selectedText(state: EditorState): { from: number; to: number } | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || selection.empty) return null;
  return { from: selection.from, to: selection.to };
}

// The box around the selected text, in the viewport: from its first character's line to its last's.
function selectionRect(view: EditorView, from: number, to: number): DOMRect | null {
  if (view.isDestroyed) return null;
  try {
    const start = view.coordsAtPos(from, 1);
    const end = view.coordsAtPos(to, -1);
    const left = Math.min(start.left, end.left);
    const top = Math.min(start.top, end.top);
    return new DOMRect(
      left,
      top,
      Math.max(start.right, end.right) - left,
      Math.max(start.bottom, end.bottom) - top,
    );
  } catch {
    return null;
  }
}

// Whether focus is in the document, and whether a pointer is pressed on it, as the reader selects.
function useDocumentFocus(view: EditorView | null) {
  const [focused, setFocused] = useState(false);
  const [pressing, setPressing] = useState(false);
  useEffect(() => {
    if (!view) return undefined;
    const { dom } = view;
    const owner = dom.ownerDocument.defaultView;
    const onFocusIn = () => setFocused(true);
    const onFocusOut = () => setFocused(false);
    const onDown = (event: PointerEvent) => {
      if (event.button === 0) setPressing(true);
    };
    const onUp = () => setPressing(false);
    dom.addEventListener('focusin', onFocusIn);
    dom.addEventListener('focusout', onFocusOut);
    dom.addEventListener('pointerdown', onDown);
    owner?.addEventListener('pointerup', onUp);
    return () => {
      dom.removeEventListener('focusin', onFocusIn);
      dom.removeEventListener('focusout', onFocusOut);
      dom.removeEventListener('pointerdown', onDown);
      owner?.removeEventListener('pointerup', onUp);
    };
  }, [view]);
  return { focused, pressing };
}

// Alt+F10 in the document moves focus to the toolbar's first control, while it shows.
function useFocusKey(view: EditorView | null, row: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!view) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'F10' || !event.altKey) return;
      const first = row.current?.querySelector<HTMLElement>('button:not([disabled])');
      if (!first) return;
      event.preventDefault();
      first.focus();
    };
    view.dom.addEventListener('keydown', onKeyDown);
    return () => view.dom.removeEventListener('keydown', onKeyDown);
  }, [view, row]);
}

/** What the selection toolbar reads. */
export interface DocumentSelectionToolbarProps {
  context: EditorContext;
  view: EditorView | null;
  startCommentRef: RefObject<(() => void) | null>;
  options: SelectionToolbarOptions;
}

// The groups the toolbar's own items and the host's make, as the host arranges them: the formats
// only while the writer can edit.
function useSelectionGroups({ context, startCommentRef, options }: DocumentSelectionToolbarProps) {
  const { schema } = context.state;
  const { labels, editable } = context;
  const shortcuts = shortcutsOf(context.state);
  return useMemo(() => {
    const marks = {
      id: 'marks',
      items: [...markItems(schema, labels, shortcuts), linkItem(labels)],
    };
    const comment = { id: 'comment', items: [commentItem(labels, startCommentRef)] };
    return arrangeToolbar(editable ? [marks, comment] : [comment], options);
  }, [schema, labels, shortcuts, editable, startCommentRef, options]);
}

/**
 * The floating toolbar over selected text (DOCE-EDITOR-4.21): it shows while text is selected and
 * focus is in the document or in it, not while a pointer is still selecting, and its items read the
 * editor's context as the toolbar's do.
 */
export function DocumentSelectionToolbar(props: DocumentSelectionToolbarProps) {
  const { context, view } = props;
  const groups = useSelectionGroups(props);
  const row = useRef<HTMLDivElement | null>(null);
  const trigger = useMemo(() => ({ current: view?.dom ?? null }), [view]);
  const { focused, pressing } = useDocumentFocus(view);
  const [inside, setInside] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  useFocusKey(view, row);
  const range = selectedText(context.state);
  const key = range ? `${range.from}:${range.to}` : '';
  const shown = groups.some((group) =>
    group.items.some((item) => item.isVisible?.(context) ?? true),
  );
  const isOpen =
    shown &&
    view !== null &&
    range !== null &&
    (focused || inside) &&
    !pressing &&
    dismissed !== key;
  return (
    <FloatingToolbar
      {...hooks.slot('selection-toolbar')}
      aria-label={context.labels.selectionToolbar}
      isOpen={isOpen}
      triggerRef={trigger}
      getTargetRect={() => (view && range ? selectionRect(view, range.from, range.to) : null)}
      targetKey={key}
      rowRef={row}
      onFocus={() => setInside(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setInside(false);
      }}
      onDismiss={() => {
        setDismissed(key);
        setInside(false);
        view?.focus();
      }}
    >
      <ToolbarItemGroups groups={groups} context={context} />
    </FloatingToolbar>
  );
}
