// Each person's own undo in a shared document (RT-10): a Yjs undo manager that tracks only the
// changes the editor's sync plugin sends as the editor's own, so undo and redo touch only that
// person's changes, never another person's, a derived write or a system change. The editor's keys,
// toolbar and menus run it through `undoCommand` and `redoCommand` when the state's history is off.

import * as Y from '@y/y';
import { Plugin, PluginKey } from 'prosemirror-state';
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

/**
 * The undo and redo of the editor's own changes in the shared document that the state's sync
 * plugin (`createCollabSync`) keeps. Run it after the sync plugin, with the editing history off
 * (`createDocumentEditing({ history: false })`).
 */
export function createCollabUndo({ captureTimeout = 500 }: CollabUndoOptions = {}): Plugin {
  let manager: Y.UndoManager | null = null;
  const plugin = new Plugin({
    key: collabUndoKey,
    // Kept out of the paged layout's measuring view, which runs no sync plugin (DOCE-COLLAB-4.1).
    measured: false,
    view(view) {
      // One view at a time keeps the undo manager, as the sync plugin binds one view at a time.
      if (manager) return {};
      const sync = getCollabSync(view.state);
      if (!sync)
        throw new Error('createCollabUndo runs only with a sync plugin (createCollabSync).');
      const own = new Y.UndoManager(sync.type, {
        trackedOrigins: new Set([sync.origin]),
        captureTimeout,
      });
      manager = own;
      return {
        destroy() {
          own.destroy();
          if (manager === own) manager = null;
        },
      };
    },
  });
  return provideUndoCommands(plugin, {
    undo: (_state, dispatch) => {
      if (!manager?.canUndo()) return false;
      // The sync plugin applies the undo to the editor at once, as its own transaction.
      if (dispatch) manager.undo();
      return true;
    },
    redo: (_state, dispatch) => {
      if (!manager?.canRedo()) return false;
      if (dispatch) manager.redo();
      return true;
    },
  });
}
