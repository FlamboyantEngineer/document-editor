import { history } from 'prosemirror-history';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, Plugin } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { parseMarkup } from '../../test/document-markup.js';
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
});
