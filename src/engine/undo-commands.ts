// The undo and redo the editor's keys, toolbar and menus run. By default they are the editing
// history's (`prosemirror-history`); a plugin that keeps the undo history elsewhere, such as a shared
// document's per-person undo, provides its own, which the editor then runs instead (RT-10).

import { redo as historyRedo, undo as historyUndo } from 'prosemirror-history';
import type { Command, EditorState, Plugin } from 'prosemirror-state';

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

const HISTORY_COMMANDS: UndoCommands = { undo: historyUndo, redo: historyRedo };

/** Undoes the writer's last change, with the state's undo (`undoCommandsOf`). */
export const undoCommand: Command = (state, dispatch, view) =>
  undoCommandsOf(state).undo(state, dispatch, view);

/** Redoes the writer's last undone change, with the state's redo (`undoCommandsOf`). */
export const redoCommand: Command = (state, dispatch, view) =>
  undoCommandsOf(state).redo(state, dispatch, view);
