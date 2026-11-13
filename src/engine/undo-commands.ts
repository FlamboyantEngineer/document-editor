// The undo and redo the editor's keys, toolbar and menus run. By default they are the editing
// history's (`prosemirror-history`); a plugin that keeps the undo history elsewhere, such as a shared
// document's per-person undo, provides its own, which the editor then runs instead (RT-10).

import { redo as historyRedo, undo as historyUndo } from 'prosemirror-history';
import type { Command, EditorState, Plugin } from 'prosemirror-state';
import { editLockKey, type HistoryDirection, isRefusedBy } from './edit-lock.js';
import { captureTransaction } from './table-parts.js';

/** An undo and a redo command. */
export interface UndoCommands {
  readonly undo: Command;
  readonly redo: Command;
}

const providers = new WeakMap<Plugin, UndoCommands>();

/**
 * Makes `plugin` the provider of the state's undo and redo: while a state runs it, `undoCommand`
 * and `redoCommand` run `commands`. Returns the plugin.
 */
export function provideUndoCommands<T extends Plugin>(plugin: T, commands: UndoCommands): T {
  providers.set(plugin, commands);
  return plugin;
}

/** The undo and redo of the first plugin of the state that provides them, else the history's. */
export function undoCommandsOf(state: EditorState): UndoCommands {
  for (const plugin of state.plugins) {
    const commands = providers.get(plugin);
    if (commands) return commands;
  }
  return HISTORY_COMMANDS;
}

// The history's undo or redo under an edit lock. An undo is the writer's change, so the lock
// refuses one into content locked since, and the history, which a refused change leaves as it
// was, offers the same one again: undo stops there. Run, the command tells the lock so instead of
// dispatching a change that goes nowhere, and still handles its key, which the browser's own undo
// would otherwise take. Asked, it then answers false. Telling takes the change built and each of
// its steps checked, the cost of the undo itself, so it is found when the writer undoes and kept
// in the lock's state, not worked out each time a control asks.
function underLock(direction: HistoryDirection, command: Command): Command {
  return (state, dispatch, view) => {
    const lock = editLockKey.getState(state);
    if (!lock) return command(state, dispatch, view);
    if (!dispatch) return command(state) && lock.refused !== direction;
    const offered = captureTransaction(command, state);
    if (!offered) return false;
    dispatch(isRefusedBy(lock, offered) ? state.tr.setMeta(editLockKey, direction) : offered);
    return true;
  };
}

const HISTORY_COMMANDS: UndoCommands = {
  undo: underLock('undo', historyUndo),
  redo: underLock('redo', historyRedo),
};

/** Undoes the writer's last change, with the state's undo (`undoCommandsOf`). */
export const undoCommand: Command = (state, dispatch, view) =>
  undoCommandsOf(state).undo(state, dispatch, view);

/** Redoes the writer's last undone change, with the state's redo (`undoCommandsOf`). */
export const redoCommand: Command = (state, dispatch, view) =>
  undoCommandsOf(state).redo(state, dispatch, view);
