// Each person's own undo in a shared document (RT-10): a Yjs undo manager that tracks only the
// changes the editor's sync plugin sends as the editor's own, so undo and redo touch only that
// person's changes, never another person's, a derived write or a system change. The editor's keys,
// toolbar and menus run it through `undoCommand` and `redoCommand` when the state's history is off.

import * as Y from '@y/y';
import type { Node } from 'prosemirror-model';
import { type Command, Plugin, PluginKey, Selection, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { provideUndoCommands } from '../engine/undo-commands.js';
import { getCollabSync } from './sync.js';

/** How a shared document's undo groups changes. */
export interface CollabUndoOptions {
  /**
   * Changes the editor sends within this many milliseconds of each other undo as one. Defaults to
   * 500, as the editing history groups typing.
   */
  captureTimeout?: number | undefined;
}

const collabUndoKey = new PluginKey('collab-undo');

// The caret put at the end of what an undo or a redo changed in the view's document, which was
// `before`, so the change comes into view (DOCE-EDITING-2.11); the sync plugin keeps the caret
// where it was.
function caretAtChange(view: EditorView, before: Node, dispatch: (tr: Transaction) => void) {
  const { state } = view;
  const start = before.content.findDiffStart(state.doc.content);
  const end = before.content.findDiffEnd(state.doc.content);
  if (start === null || !end) return;
  // Where the text either side repeats, the end found runs back past the start; it is moved on.
  const at = end.b + Math.max(0, start - Math.min(end.a, end.b));
  dispatch(state.tr.setSelection(Selection.near(state.doc.resolve(at), -1)));
}

// The manager's undo or redo, with the caret at what it changed.
function stepping(manager: () => Y.UndoManager | null, direction: 'undo' | 'redo'): Command {
  return (_state, dispatch, view) => {
    const own = manager();
    if (!own || !(direction === 'undo' ? own.canUndo() : own.canRedo())) return false;
    if (!dispatch) return true;
    const before = view?.state.doc;
    // The sync plugin applies the step to the editor at once, as its own transaction.
    own[direction]();
    if (view && before) caretAtChange(view, before, dispatch);
    return true;
  };
}

/**
 * The undo and redo of the editor's own changes in the shared document that the state's sync
 * plugin (`createCollabSync`) keeps. Run it after the sync plugin, with the editing history off
 * (`createDocumentEditing({ history: false })`).
 */
export function createCollabUndo({ captureTimeout = 500 }: CollabUndoOptions = {}): Plugin {
  let manager: Y.UndoManager | null = null;
  // The shared type the manager tracks, and whether a view keeps it.
  let tracked: Y.Type | null = null;
  let kept = false;
  const plugin = new Plugin({
    key: collabUndoKey,
    // Kept out of the paged layout's measuring view, which runs no sync plugin (DOCE-COLLAB-4.1).
    measured: false,
    view(view) {
      // One view at a time keeps the undo manager, as the sync plugin binds one view at a time.
      if (kept) return {};
      const sync = getCollabSync(view.state);
      if (!sync)
        throw new Error('createCollabUndo runs only with a sync plugin (createCollabSync).');
      // A state that takes other plugins, as when the paged layout starts or stops, starts every
      // plugin view again: this view takes over the manager the last one left, so what the reader
      // may undo outlives the change of layout.
      const left = tracked === sync.type ? manager : null;
      if (!left) manager?.destroy();
      const own =
        left ??
        new Y.UndoManager(sync.type, { trackedOrigins: new Set([sync.origin]), captureTimeout });
      manager = own;
      tracked = sync.type;
      kept = true;
      return {
        destroy() {
          kept = false;
          // The manager goes once no view has taken it over by the end of this change.
          queueMicrotask(() => {
            if (kept || manager !== own) return;
            own.destroy();
            manager = null;
            tracked = null;
          });
        },
      };
    },
  });
  return provideUndoCommands(plugin, {
    undo: stepping(() => manager, 'undo'),
    redo: stepping(() => manager, 'redo'),
  });
}
