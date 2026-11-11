// What the editor's chrome and a host's own controls act on: the engine's view, the state shown,
// whether the writer can edit, and the editor's labels, with a way to run a command. The editor
// hands it to toolbar items and context menu providers, and to any component inside it through
// `useDocumentEditor`.

import type { Command, EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { createContext, useContext } from 'react';
import { isPositionLocked } from '../../engine/index.js';
import type { DocumentEditorLabels } from './editor-labels.js';

/**
 * A dialog of the editor's that inserts or changes an object at the selection: math, inline or as
 * a block, a figure, a link, linked code, the caption of a table, figure or code block, a reference
 * or an abbreviation. It changes the object selected, or inserts one.
 */
export type ObjectDialog =
  | { readonly kind: 'math'; readonly display: boolean }
  | { readonly kind: 'figure' }
  | { readonly kind: 'link' }
  | { readonly kind: 'linked-code' }
  | { readonly kind: 'caption' }
  | { readonly kind: 'reference' }
  | { readonly kind: 'abbreviation' }
  | { readonly kind: 'script' };

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
  readonly labels: DocumentEditorLabels;
  /** Whether a command can run on the state shown, while the writer can edit there. */
  canRun(command: Command): boolean;
  /** Runs a command on the view's latest state, then returns focus to the document. */
  run(command: Command): void;
  /** Opens one of the editor's dialogs for the selection; nothing while the editor has none. */
  openDialog(dialog: ObjectDialog): void;
}

/** The editor context for a view and a state. */
export function createEditorContext(
  view: EditorView | null,
  state: EditorState,
  options: {
    readonly editable: boolean;
    readonly labels: DocumentEditorLabels;
    readonly openDialog?: ((dialog: ObjectDialog) => void) | undefined;
  },
): EditorContext {
  const locked = isPositionLocked(state, state.selection.head);
  const { openDialog = () => undefined, ...rest } = options;
  return {
    view,
    state,
    ...rest,
    locked,
    openDialog,
    canRun: (command) =>
      options.editable && !locked && view !== null && command(state, undefined, view),
    run: (command) => {
      if (!view) return;
      command(view.state, view.dispatch, view);
      view.focus();
    },
  };
}

export const DocumentEditorContext = createContext<EditorContext | null>(null);

/**
 * The editor holding the calling component, for a host's controls rendered inside it, such as its
 * `children` or a toolbar item; null outside an editor.
 */
export function useDocumentEditor(): EditorContext | null {
  return useContext(DocumentEditorContext);
}
