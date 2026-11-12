// The editor's shortcuts as one table: the keys of each action by its id, in ProseMirror's key
// notation (`Mod-b`, `Mod-Shift-z`; Mod is Ctrl, or Cmd on a Mac). The document's keymap binds
// them, the editor's own keys read them, the toolbar and menus show them, and a host remaps any of
// them through the editing's `shortcuts` option.

import { keydownHandler } from 'prosemirror-keymap';
import { type Command, type EditorState, Plugin, PluginKey } from 'prosemirror-state';

/** The library's shortcuts by id, each its keys, the first the one the toolbar and menus show. */
export const DEFAULT_SHORTCUTS = {
  undo: ['Mod-z'],
  redo: ['Mod-y', 'Mod-Shift-z'],
  'select-all': ['Mod-a'],
  bold: ['Mod-b'],
  italic: ['Mod-i'],
  underline: ['Mod-u'],
  strikethrough: ['Mod-Shift-s'],
  code: ['Mod-Alt-i'],
  superscript: ['Mod-.', 'Mod-;'],
  subscript: ['Mod-,', "Mod-'"],
  'clear-formatting': ['Mod-\\', 'Mod-Space'],
  paragraph: ['Mod-Shift-0'],
  'heading-1': ['Mod-Shift-1'],
  'heading-2': ['Mod-Shift-2'],
  'heading-3': ['Mod-Shift-3'],
  'heading-4': ['Mod-Shift-4'],
  'heading-5': ['Mod-Shift-5'],
  'heading-6': ['Mod-Shift-6'],
  'bullet-list': ['Mod-Shift-8'],
  'numbered-list': ['Mod-Shift-7'],
  'page-break': ['Mod-Alt-Enter'],
  'code-block': ['Mod-Alt-c'],
  footnote: ['Mod-Alt-f'],
  'insert-table': ['Mod-Alt-t'],
  math: ['Mod-Alt-l'],
  script: ['Mod-Alt-s'],
  reference: ['Mod-k'],
  comment: ['Mod-Alt-m'],
  find: ['Mod-f'],
  replace: ['Mod-h'],
  save: ['Mod-s'],
} as const satisfies Readonly<Record<string, readonly string[]>>;

/** An action the shortcut table binds. */
export type ShortcutId = keyof typeof DEFAULT_SHORTCUTS;

/** The keys of every action, by its id. */
export type ShortcutTable = Readonly<Record<ShortcutId, readonly string[]>>;

/** A host's remapping: an action's keys in place of the library's, none to leave it unbound. */
export type ShortcutOverrides = Readonly<
  Partial<Record<ShortcutId, string | readonly string[] | null>>
>;

/** Holds the editor's shortcut table, which the chrome and the editor's own keys read. */
export const shortcutsKey = new PluginKey<ShortcutTable>('document-shortcuts');

// A key name split into its modifiers and its key: `Mod-Shift--` is Mod, Shift and `-`.
const partsOf = (name: string) => {
  const parts = name.split(/-(?!$)/);
  const key = parts.pop() ?? '';
  return { key, modifiers: new Set(parts) };
};

// How the base library's shortcut notation names a modifier: Ctrl is Cmd on a Mac.
const SHOWN_MODIFIERS: Readonly<Record<string, string>> = {
  Mod: 'Ctrl',
  Ctrl: 'Ctrl',
  Control: 'Ctrl',
  Cmd: 'Meta',
  Meta: 'Meta',
  Alt: 'Alt',
  Shift: 'Shift',
};

// The order the notation lists modifiers in.
const MODIFIER_ORDER = ['Ctrl', 'Meta', 'Alt', 'Shift'];

/** The library's table with a host's remapping applied. */
export function resolveShortcuts(overrides: ShortcutOverrides = {}): ShortcutTable {
  const table: Record<string, readonly string[]> = { ...DEFAULT_SHORTCUTS };
  for (const [id, keys] of Object.entries(overrides)) {
    if (keys === undefined) continue;
    table[id] = keys === null ? [] : typeof keys === 'string' ? [keys] : keys;
  }
  return table as ShortcutTable;
}

/**
 * The document's keymap: binds its keys and holds the table they came from, for the chrome and the
 * editor's own keys to read.
 */
export function createShortcuts(
  table: ShortcutTable,
  bindings: Readonly<Record<string, Command>>,
): Plugin<ShortcutTable> {
  return new Plugin({
    key: shortcutsKey,
    state: { init: () => table, apply: (_tr, value) => value },
    props: { handleKeyDown: keydownHandler(bindings) },
  });
}

/** The table a state's editing installed, or the library's own. */
export function shortcutsOf(state: EditorState): ShortcutTable {
  return shortcutsKey.getState(state) ?? DEFAULT_SHORTCUTS;
}

/**
 * A key name in the base library's shortcut notation, such as `Ctrl+Shift+S` for `Mod-Shift-s`,
 * which shows Cmd on a Mac.
 */
export function formatShortcut(name: string): string {
  const { key, modifiers } = partsOf(name);
  const shown = MODIFIER_ORDER.filter((modifier) =>
    [...modifiers].some((each) => SHOWN_MODIFIERS[each] === modifier),
  );
  return [...shown, key.length === 1 ? key.toUpperCase() : key].join('+');
}

/** The first key of an action, as the toolbar and menus show it; none while it is unbound. */
export function shortcutLabel(table: ShortcutTable, id: ShortcutId): string | undefined {
  const [first] = table[id];
  return first === undefined ? undefined : formatShortcut(first);
}

// The physical key a key name means, for keys a held Alt turns into another character on a Mac.
function codeOf(key: string): string | null {
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  return null;
}

// Whether a key event presses a key name: its modifiers exactly, Mod as Ctrl or Cmd.
function matchesKey(event: KeyboardEvent, name: string): boolean {
  const { key, modifiers } = partsOf(name);
  const has = (...names: string[]) => names.some((each) => modifiers.has(each));
  const mod = has('Mod');
  const ctrl = has('Ctrl', 'Control');
  const meta = has('Cmd', 'Meta');
  if (mod ? !(event.ctrlKey || event.metaKey) : event.ctrlKey !== ctrl || event.metaKey !== meta) {
    return false;
  }
  if (event.altKey !== has('Alt') || event.shiftKey !== has('Shift')) return false;
  const pressed = event.key === ' ' ? 'Space' : event.key;
  return pressed.toLowerCase() === key.toLowerCase() || event.code === codeOf(key);
}

/** Whether a key event presses one of an action's keys. */
export function matchesShortcut(table: ShortcutTable, id: ShortcutId, event: KeyboardEvent) {
  return table[id].some((name) => matchesKey(event, name));
}
