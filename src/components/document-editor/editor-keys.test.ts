import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { parseMarkup } from '../../../test/document-markup.js';
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
      state,
    });
    expect(none).toEqual([]);
    const keys = editorKeys({
      startComment: null,
      onDialog: () => undefined,
      scripts: false,
      copyLink: null,
      state,
    });
    expect(ids(keys)).not.toContain('script');
  });

  it('DOCE-EDITOR-6.2 binds starting a comment and copying a link while the host takes them', () => {
    const keys = editorKeys({
      startComment: () => undefined,
      onDialog: null,
      scripts: false,
      copyLink: () => undefined,
      state: stateAt('<p>Alpha</p>', 2),
    });
    expect(ids(keys)).toEqual(['comment', 'copy-link']);
  });
});
