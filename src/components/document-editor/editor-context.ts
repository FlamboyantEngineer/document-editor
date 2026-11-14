// What the editor's chrome and a host's own controls act on: the engine's view, the state shown,
// whether the writer can edit, and the editor's labels, with a way to run a command. The editor
// hands it to toolbar items and context menu providers, and to any component inside it through
// `useDocumentEditor`.

import type { Attrs } from 'prosemirror-model';
import type { Command, EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { createContext, useContext, useMemo } from 'react';
import { isActive, isPositionLocked } from '../../engine/index.js';
import type { EditingMode } from '../../host/index.js';
import type { DocumentEditorProps } from './document-editor.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import type { DocumentLayout } from './use-document-layout.js';

/** How suggestions show in the document. */
export type DocumentMarkup = 'all' | 'simple' | 'final' | 'original';

/**
 * A dialog of the editor's that inserts or changes an object at the selection: math, inline or as
 * a block, a figure, a link, linked code, the caption of a table, figure or code block, a reference
 * or an abbreviation, or one of the host's own. It changes the object selected, or inserts one.
 */
export type ObjectDialog =
  | { readonly kind: 'math'; readonly display: boolean }
  | { readonly kind: 'figure'; readonly figureType?: 'image' | 'diagram' | undefined }
  | { readonly kind: 'link' }
  | { readonly kind: 'linked-code' }
  | { readonly kind: 'caption' }
  | { readonly kind: 'reference'; readonly reference?: 'internal' | 'external' | undefined }
  | { readonly kind: 'abbreviation' }
  | { readonly kind: 'script' }
  /** One of the host's own dialogs (`dialogs`), by its name, with what the opener hands it. */
  | { readonly kind: 'host'; readonly name: string; readonly data?: unknown };

/** The editor as its chrome and a host's controls see it. */
export interface EditorContext {
  /** The engine's view, once it is mounted. */
  readonly view: EditorView | null;
  /** The state the editor shows. */
  readonly state: EditorState;
  /** Whether the writer can edit the document now. */
  readonly editable: boolean;
  /** Whether the selection's head is at a locked position (`createEditLock`). */
  readonly locked: boolean;
  /** How the writer works in the document now. */
  readonly mode: EditingMode;
  /** Whether an editable document takes changes as suggestions. */
  readonly suggesting: boolean;
  /** How suggestions show. */
  readonly markup: DocumentMarkup;
  /** On pages or in the web layout. */
  readonly layout: DocumentLayout;
  /** The document's zoom, in percent. */
  readonly zoom: number;
  readonly labels: DocumentEditorLabels;
  /** Whether a command can run on the state shown, while the writer can edit there. */
  canRun(command: Command): boolean;
  /**
   * Whether the mark or node of a schema name holds at the selection shown, with each of `attrs`
   * when given (`isActive`).
   */
  isActive(name: string, attrs?: Attrs): boolean;
  /** Runs a command on the view's latest state, then returns focus to the document. */
  run(command: Command): void;
  /** Opens one of the editor's dialogs for the selection; nothing while the editor has none. */
  openDialog(dialog: ObjectDialog): void;
}

/** What the editor context says beside its view and state. */
export interface EditorContextOptions {
  readonly editable: boolean;
  readonly labels: DocumentEditorLabels;
  readonly openDialog?: ((dialog: ObjectDialog) => void) | undefined;
  /** Whether an editable document takes changes as suggestions. Defaults to false. */
  readonly suggesting?: boolean | undefined;
  /** Whether a read document may be commented on. Defaults to false. */
  readonly commenting?: boolean | undefined;
  readonly markup?: DocumentMarkup | undefined;
  readonly layout?: DocumentLayout | undefined;
  readonly zoom?: number | undefined;
}

/** The mode the editor's props put the writer in. */
export function editingModeOf({
  editable,
  suggesting = false,
  commenting = false,
}: Pick<EditorContextOptions, 'editable' | 'suggesting' | 'commenting'>): EditingMode {
  if (editable) return suggesting ? 'suggest' : 'edit';
  return commenting ? 'comment' : 'read';
}

/** The editor context for a view and a state. */
export function createEditorContext(
  view: EditorView | null,
  state: EditorState,
  options: EditorContextOptions,
): EditorContext {
  const locked = isPositionLocked(state, state.selection.head);
  const { openDialog = () => undefined, editable, labels } = options;
  return {
    view,
    state,
    editable,
    labels,
    locked,
    mode: editingModeOf(options),
    suggesting: editable && (options.suggesting ?? false),
    markup: options.markup ?? 'all',
    layout: options.layout ?? 'page',
    zoom: options.zoom ?? 100,
    openDialog,
    canRun: (command) =>
      options.editable && !locked && view !== null && command(state, undefined, view),
    isActive: (name, attrs) => isActive(state, name, attrs),
    run: (command) => {
      if (!view) return;
      command(view.state, view.dispatch, view);
      view.focus();
    },
  };
}

/**
 * Why the writer cannot change the document at the selection, for a control's disabled reason:
 * the document is read, or the position is locked; none while they can.
 */
export function unavailableReason(context: EditorContext): string | undefined {
  if (!context.editable) return context.labels.reasonReading;
  return context.locked ? context.labels.reasonLocked : undefined;
}

/** What the editor's props say of it in its context: its mode, markup, layout and zoom. */
export function contextOptionsOf(
  props: DocumentEditorProps,
  { labels, openDialog }: Pick<EditorContextOptions, 'labels' | 'openDialog'>,
): EditorContextOptions {
  const { editable = true, suggesting, markup, layout, zoom } = props;
  const commenting = Boolean(props.comments) && props.comments?.canComment !== false;
  return { editable, labels, openDialog, suggesting, commenting, markup, layout, zoom };
}

/** The editor context of the view and the state shown, with the props' mode, markup, layout and zoom. */
export function useShownContext(
  props: DocumentEditorProps,
  {
    view,
    labels,
    openDialog,
  }: {
    view: EditorView | null;
    labels: DocumentEditorLabels;
    openDialog: (dialog: ObjectDialog) => void;
  },
): EditorContext {
  const { state } = props;
  const { editable, suggesting, commenting, markup, layout, zoom } = contextOptionsOf(props, {
    labels,
  });
  return useMemo(
    () =>
      createEditorContext(view, state, {
        editable,
        labels,
        openDialog,
        suggesting,
        commenting,
        markup,
        layout,
        zoom,
      }),
    [view, state, editable, labels, openDialog, suggesting, commenting, markup, layout, zoom],
  );
}

export const DocumentEditorContext = createContext<EditorContext | null>(null);

/**
 * The editor holding the calling component, for a host's controls rendered inside it, such as its
 * `children` or a toolbar item; null outside an editor.
 */
export function useDocumentEditor(): EditorContext | null {
  return useContext(DocumentEditorContext);
}
