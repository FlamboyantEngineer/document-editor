import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { parseMarkup } from '../../../test/document-markup.js';
import { scriptBlockAt } from '../../engine/index.js';
import type { ObjectDialog } from './editor-context.js';
import { editorKeys } from './editor-keys.js';

// A state with the caret at `pos`.
function stateAt(markup: string, pos: number) {
  const doc = parseMarkup(markup);
  return EditorState.create({ doc, selection: TextSelection.create(doc, pos) });
}

const ids = (keys: ReturnType<typeof editorKeys>) => keys.map(([id]) => id);

describe('editor keys', () => {
  it('DOCE-EDITOR-6.2 binds the figure, display math, reference and script dialogs where they can insert', () => {
    const opened: ObjectDialog[] = [];
    const keys = editorKeys({
      startComment: null,
      onDialog: (dialog) => opened.push(dialog),
      scripts: true,
      copyLink: null,
      run: () => undefined,
      state: stateAt('<p>Alpha</p>', 2),
    });
    expect(ids(keys)).toEqual(expect.arrayContaining(['figure', 'display-math', 'script']));
    for (const [, run] of keys) run();
    expect(opened).toEqual(
      expect.arrayContaining([{ kind: 'figure' }, { kind: 'math', display: true }]),
    );
  });

  it('DOCE-EDITOR-6.2 binds no dialog without a way to open one, nor the script dialog without scripts', () => {
    const state = stateAt('<p>Alpha</p>', 2);
    const none = editorKeys({
      startComment: null,
      onDialog: null,
      scripts: true,
      copyLink: null,
      run: () => undefined,
      state,
    });
    expect(none).toEqual([]);
    const keys = editorKeys({
      startComment: null,
      onDialog: () => undefined,
      scripts: false,
      copyLink: null,
      run: () => undefined,
      state,
    });
    expect(ids(keys)).not.toContain('script');
  });

  it('DOCE-EDITOR-4.8 puts an empty script block in at once on the script key, then opens its dialog', () => {
    const ran: string[] = [];
    let state = stateAt('<p>Alpha</p>', 2);
    const run = (command: Command) => {
      command(state, (tr) => {
        state = state.apply(tr);
        ran.push('insert');
      });
    };
    const keys = editorKeys({
      startComment: null,
      onDialog: () => ran.push('dialog'),
      scripts: true,
      copyLink: null,
      run,
      state,
    });
    keys.find(([id]) => id === 'script')?.[1]();
    expect(ran).toEqual(['insert', 'dialog']);
    expect(scriptBlockAt(state)?.node.attrs.script).toBe('');
    // In that block, the key edits it and inserts nothing more.
    ran.length = 0;
    const inBlock = editorKeys({
      startComment: null,
      onDialog: () => ran.push('dialog'),
      scripts: true,
      copyLink: null,
      run,
      state,
    });
    inBlock.find(([id]) => id === 'script')?.[1]();
    expect(ran).toEqual(['dialog']);
  });

  it('DOCE-EDITOR-6.2 binds starting a comment and copying a link while the host takes them', () => {
    const keys = editorKeys({
      startComment: () => undefined,
      onDialog: null,
      scripts: false,
      copyLink: () => undefined,
      run: () => undefined,
      state: stateAt('<p>Alpha</p>', 2),
    });
    expect(ids(keys)).toEqual(['comment', 'copy-link']);
  });
});
