import { GapCursor } from 'prosemirror-gapcursor';
import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { createDocumentEditing, documentKeys } from './document-editing.js';
import {
  DEFAULT_SHORTCUTS,
  formatShortcut,
  matchesShortcut,
  resolveShortcuts,
  shortcutLabel,
  shortcutsOf,
} from './shortcuts.js';

const paragraph = (text: string): StoredNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});
const table: StoredNode = {
  type: 'table',
  content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph('Cell')] }] }],
};
const read = (...content: StoredNode[]) =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema).doc;

const press = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

function run(state: EditorState, command: Command | undefined): EditorState {
  let next = state;
  expect(command?.(state, (tr) => (next = next.applyTransaction(tr).state))).toBe(true);
  return next;
}

describe('the shortcut table', () => {
  it('DOCE-EDITOR-6.2 remaps, adds and unbinds keys over the library table', () => {
    const table = resolveShortcuts({ bold: 'Mod-Shift-b', italic: ['Mod-i', 'Mod-e'], find: null });
    expect(table.bold).toEqual(['Mod-Shift-b']);
    expect(table.italic).toEqual(['Mod-i', 'Mod-e']);
    expect(table.find).toEqual([]);
    expect(table.underline).toEqual(DEFAULT_SHORTCUTS.underline);
    expect(resolveShortcuts()).toEqual(DEFAULT_SHORTCUTS);
  });

  it('DOCE-EDITOR-6.2 shows the first key of an action in the base library notation', () => {
    expect(formatShortcut('Mod-Shift-s')).toBe('Ctrl+Shift+S');
    expect(formatShortcut('Mod-Alt-Enter')).toBe('Ctrl+Alt+Enter');
    expect(formatShortcut('Shift-Mod--')).toBe('Ctrl+Shift+-');
    expect(formatShortcut('Mod-\\')).toBe('Ctrl+\\');
    expect(shortcutLabel(DEFAULT_SHORTCUTS, 'redo')).toBe('Ctrl+Y');
    expect(shortcutLabel(resolveShortcuts({ redo: null }), 'redo')).toBeUndefined();
  });

  it('DOCE-EDITOR-6.2 matches key presses, Mod as Ctrl or Cmd and letters by their key', () => {
    const table = DEFAULT_SHORTCUTS;
    expect(matchesShortcut(table, 'find', press({ key: 'f', ctrlKey: true }))).toBe(true);
    expect(matchesShortcut(table, 'find', press({ key: 'f', metaKey: true }))).toBe(true);
    expect(matchesShortcut(table, 'find', press({ key: 'f', ctrlKey: true, shiftKey: true }))).toBe(
      false,
    );
    expect(matchesShortcut(table, 'find', press({ key: 'f' }))).toBe(false);
    // Alt turns M into another character on a Mac; the physical key still matches.
    const comment = press({ key: 'µ', code: 'KeyM', metaKey: true, altKey: true });
    expect(matchesShortcut(table, 'comment', comment)).toBe(true);
    expect(matchesShortcut(resolveShortcuts({ comment: null }), 'comment', comment)).toBe(false);
  });

  it('DOCE-EDITOR-6.2 binds the remapped keys in the document keymap and holds the table', () => {
    const shortcuts = { bold: 'Mod-Shift-b' } as const;
    const state = EditorState.create({
      doc: read(paragraph('Alpha')),
      plugins: createDocumentEditing(documentSchema, { shortcuts }),
    });
    expect(shortcutsOf(state).bold).toEqual(['Mod-Shift-b']);
    const keys = documentKeys(documentSchema, undefined, shortcutsOf(state));
    expect(keys['Mod-Shift-b']).toBeDefined();
    expect(keys['Mod-b']).toBeUndefined();
    const plain = EditorState.create({ doc: read(paragraph('Alpha')) });
    expect(shortcutsOf(plain)).toBe(DEFAULT_SHORTCUTS);
  });

  it('DOCE-EDITOR-6.2 adds Mod-; and Mod-apostrophe for superscript and subscript', () => {
    const keys = documentKeys(documentSchema);
    const doc = read(paragraph('Alpha'));
    const plugins = createDocumentEditing(documentSchema);
    const selected = (state: EditorState) =>
      state.apply(state.tr.setSelection(TextSelection.create(state.doc, 6, 11)));
    const marked = (state: EditorState, name: string) => {
      const type = state.schema.marks[name];
      return type !== undefined && state.doc.rangeHasMark(6, 11, type);
    };
    const start = selected(EditorState.create({ doc, plugins }));
    expect(marked(run(start, keys['Mod-;']), 'superscript')).toBe(true);
    expect(marked(run(start, keys["Mod-'"]), 'subscript')).toBe(true);
  });

  it('DOCE-EDITOR-6.2 adds a paragraph with Enter at a gap cursor between objects', () => {
    const keys = documentKeys(documentSchema);
    const doc = read(table, table);
    let state = EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) });
    const first = state.doc.child(0).child(0).child(1).child(0);
    const between = 5 + first.nodeSize;
    state = state.apply(state.tr.setSelection(new GapCursor(state.doc.resolve(between))));
    expect(state.selection).toBeInstanceOf(GapCursor);
    state = run(state, keys.Enter);
    const content = state.doc.child(0).child(0).child(1);
    expect(content.childCount).toBe(3);
    expect(content.child(1).type.name).toBe('paragraph');
    expect(state.selection.$from.parent.type.name).toBe('paragraph');
  });
});
