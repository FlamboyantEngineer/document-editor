import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { highlightCode } from './code-highlighting.js';
import { setCodeLanguage } from './object-commands.js';
import { createObjectViews, type LineNumbers } from './object-views.js';

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

const { nodes } = documentSchema;

// A view of a code block and linked code, both in a language.
function viewOfCode(language: string, lineNumbers?: LineNumbers): EditorView {
  const code = nodes.code_block?.create({ language }, documentSchema.text('const size = 4;'));
  const linked = nodes.linked_code_block?.create({ code: 'return "a";', language });
  if (!code || !linked) throw new Error('The schema has code and linked code');
  const doc = documentSchema.topNodeType.createAndFill(null, [code, linked]);
  if (!doc) throw new Error('The document is valid');
  view = new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc, plugins: [createObjectViews({ lineNumbers })] }),
  });
  return view;
}

const tokens = (element: Element | null, kind: string) =>
  [...(element?.querySelectorAll(`.de-code-token[data-token="${kind}"]`) ?? [])].map(
    (token) => token.textContent,
  );

describe('code highlighting', () => {
  it('DOCE-OBJECTS-3.3 splits code into its tokens by language, and plain text into none', () => {
    expect(highlightCode('const size = 4;', 'typescript')).toEqual([
      { from: 0, to: 5, kind: 'keyword' },
      { from: 13, to: 14, kind: 'number' },
    ]);
    expect(highlightCode('echo $HOME # home', 'bash').map((token) => token.kind)).toEqual([
      'keyword',
      'literal',
      'comment',
    ]);
    expect(highlightCode('const size = 4;', 'plaintext')).toEqual([]);
    expect(highlightCode('const size = 4;', 'unknown')).toEqual([]);
  });

  it('DOCE-OBJECTS-3.3 marks the tokens of code blocks and linked code', () => {
    const shown = viewOfCode('typescript');
    const code = shown.dom.querySelector('pre:not(.linked-code-block pre) code');
    expect(tokens(code, 'keyword')).toEqual(['const']);
    expect(tokens(code, 'number')).toEqual(['4']);
    const linked = shown.dom.querySelector('[data-linked-code-block] code');
    expect(tokens(linked, 'keyword')).toEqual(['return']);
    expect(tokens(linked, 'string')).toEqual(['"a"']);
    expect(linked?.textContent).toBe('return "a";');
  });

  it('DOCE-OBJECTS-3.3 highlights again as the code or its language changes', () => {
    const shown = viewOfCode('plaintext', 'none');
    const code = () => shown.dom.querySelector('pre:not(.linked-code-block pre) code');
    expect(tokens(code(), 'keyword')).toEqual([]);
    shown.dispatch(shown.state.tr.setSelection(TextSelection.create(shown.state.doc, 2)));
    setCodeLanguage('typescript')(shown.state, shown.dispatch);
    expect(tokens(code(), 'keyword')).toEqual(['const']);
    shown.dispatch(shown.state.tr.insertText('let ', 1));
    expect(tokens(code(), 'keyword')).toEqual(['let', 'const']);
    expect(tokens(shown.dom.querySelector('[data-linked-code-block] code'), 'keyword')).toEqual([]);
  });
});
