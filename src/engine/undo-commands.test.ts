import { history } from 'prosemirror-history';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, Plugin, type Transaction } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { parseMarkup } from '../../test/document-markup.js';
import { createEditLock } from './edit-lock.js';
import { provideUndoCommands, redoCommand, undoCommand } from './undo-commands.js';

const start = () => parseMarkup('<p>Alpha</p>');

// A ProseMirror node's text, not a DOM node's.
const textOf = (node: ProseMirrorNode): string => node.textContent;

describe('undo commands', () => {
  it('DOCE-COLLAB-6.3 run the editing history’s undo and redo by default', () => {
    let state = EditorState.create({ doc: start(), plugins: [history()] });
    const dispatch = (tr: Parameters<Parameters<typeof undoCommand>[1] & object>[0]) => {
      state = state.apply(tr);
    };
    dispatch(state.tr.insertText(' beta', state.doc.content.size - 1));
    expect(textOf(state.doc)).toBe('Alpha beta');
    expect(undoCommand(state, dispatch)).toBe(true);
    expect(textOf(state.doc)).toBe('Alpha');
    expect(redoCommand(state, dispatch)).toBe(true);
    expect(textOf(state.doc)).toBe('Alpha beta');
  });

  it('DOCE-COLLAB-6.3 run the commands a plugin of the state provides instead', () => {
    const ran: string[] = [];
    const provider = provideUndoCommands(new Plugin({}), {
      undo: () => (ran.push('undo'), true),
      redo: () => (ran.push('redo'), true),
    });
    const state = EditorState.create({ doc: start(), plugins: [history(), provider] });
    expect(undoCommand(state)).toBe(true);
    expect(redoCommand(state)).toBe(true);
    expect(ran).toEqual(['undo', 'redo']);
  });

  it('DOCE-EDITING-4.1 stops undo at a change in content locked since, and says so once tried', () => {
    // Locks the paragraph that starts with "Beta" once the host freezes it.
    let frozen = false;
    const lock = createEditLock({
      isLocked: (doc, pos) => frozen && doc.resolve(pos).parent.textContent.startsWith('Beta'),
    });
    let state = EditorState.create({
      doc: parseMarkup('<p>Alpha</p><p>Beta</p>'),
      plugins: [history(), lock],
    });
    const dispatch = (tr: Transaction) => {
      state = state.apply(tr);
    };
    const texts = () => state.doc.children.map(textOf);
    dispatch(state.tr.insertText('!', 6));
    dispatch(state.tr.insertText('?', state.doc.content.size - 1));
    expect(texts()).toEqual(['Alpha!', 'Beta?']);
    frozen = true;
    expect(undoCommand(state)).toBe(true);
    // The key is handled, so the browser's own undo does not act, and nothing changes.
    expect(undoCommand(state, dispatch)).toBe(true);
    expect(texts()).toEqual(['Alpha!', 'Beta?']);
    expect(undoCommand(state)).toBe(false);
    // The writer's next change is one the history can undo; under it, undo stops again.
    dispatch(state.tr.insertText('!', 7));
    expect(undoCommand(state)).toBe(true);
    expect(undoCommand(state, dispatch)).toBe(true);
    expect(texts()).toEqual(['Alpha!', 'Beta?']);
    expect(undoCommand(state, dispatch)).toBe(true);
    expect(undoCommand(state)).toBe(false);
    expect(redoCommand(state)).toBe(true);
    // Open again, the same undo goes through.
    frozen = false;
    expect(undoCommand(state, dispatch)).toBe(true);
    expect(texts()).toEqual(['Alpha!', 'Beta']);
  });
});
