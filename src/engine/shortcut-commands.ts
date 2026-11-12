// The commands the shortcut table's document actions run, bound to the table's keys for the
// document's keymap.

import { toggleMark } from 'prosemirror-commands';
import { redo, undo } from 'prosemirror-history';
import type { Schema } from 'prosemirror-model';
import type { Command } from 'prosemirror-state';
import { setTextblockType } from './block-type.js';
import {
  clearFormatting,
  insertPageBreak,
  selectBody,
  wrapInListAndJoin,
} from './editing-commands.js';
import { insertFootnote } from './footnotes.js';
import { insertCodeBlock } from './object-commands.js';
import type { ShortcutId, ShortcutTable } from './shortcuts.js';
import { insertTable } from './tables.js';

// The commands of the table's document actions the schema has, by id.
function markCommands(schema: Schema): Partial<Record<ShortcutId, Command>> {
  const commands: Partial<Record<ShortcutId, Command>> = {};
  const marks = [
    ['bold', 'strong'],
    ['italic', 'em'],
    ['underline', 'underline'],
    ['strikethrough', 'strike'],
    ['superscript', 'superscript'],
    ['subscript', 'subscript'],
    ['code', 'code'],
  ] as const;
  for (const [id, name] of marks) {
    const type = schema.marks[name];
    if (type) commands[id] = toggleMark(type);
  }
  return commands;
}

function blockCommands(schema: Schema): Partial<Record<ShortcutId, Command>> {
  const commands: Partial<Record<ShortcutId, Command>> = {};
  const { heading, paragraph, bullet_list: bullets, ordered_list: ordered } = schema.nodes;
  if (heading) {
    for (const level of [1, 2, 3, 4, 5, 6] as const)
      commands[`heading-${String(level)}` as ShortcutId] = setTextblockType(heading, { level });
  }
  if (paragraph) commands.paragraph = setTextblockType(paragraph);
  if (bullets) commands['bullet-list'] = wrapInListAndJoin(bullets);
  if (ordered) commands['numbered-list'] = wrapInListAndJoin(ordered);
  return commands;
}

// The table's document actions: those the keymap runs as commands.
function shortcutCommands(schema: Schema): Partial<Record<ShortcutId, Command>> {
  return {
    ...markCommands(schema),
    ...blockCommands(schema),
    undo,
    redo,
    'select-all': selectBody,
    'clear-formatting': clearFormatting,
    'page-break': insertPageBreak,
    'code-block': insertCodeBlock(),
    footnote: insertFootnote(),
    'insert-table': insertTable({ rows: 3, columns: 3 }),
  };
}

/** Each key of the table's document actions bound to its command. */
export function boundKeys(schema: Schema, table: ShortcutTable): Record<string, Command> {
  const keys: Record<string, Command> = {};
  for (const [id, command] of Object.entries(shortcutCommands(schema))) {
    for (const key of table[id as ShortcutId]) keys[key] = command;
  }
  return keys;
}
