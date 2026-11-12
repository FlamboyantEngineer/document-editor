import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { codeHighlightName, highlightCode } from './code-highlighting.js';
import { setCodeLanguage } from './object-commands.js';
import { createObjectViews, type LineNumbers } from './object-views.js';

let view: EditorView | null = null;
// The window's highlights, which the test environment lacks.
let highlights = new Map<string, Set<AbstractRange>>();

beforeEach(() => {
  highlights = new Map();
  vi.stubGlobal('CSS', { highlights });
  vi.stubGlobal('Highlight', Set);
});

afterEach(() => {
  view?.destroy();
  view = null;
  vi.unstubAllGlobals();
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

// The text of the ranges painted with a kind's highlight, in the order they were painted.
const painted = (kind: string) =>
  [...(highlights.get(codeHighlightName(kind)) ?? [])].map((range) => String(range));

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
    expect(highlightCode('a b', 'json')).toEqual([
      { from: 0, to: 1, kind: 'invalid' },
      { from: 2, to: 3, kind: 'invalid' },
    ]);
    expect(highlightCode('ab', 'json')).toEqual([{ from: 0, to: 2, kind: 'invalid' }]);
    expect(highlightCode('const size = 4;', 'plaintext')).toEqual([]);
    expect(highlightCode('const size = 4;', 'unknown')).toEqual([]);
  });

  it('DOCE-OBJECTS-3.3 paints the tokens of code blocks and marks those of linked code', () => {
    const shown = viewOfCode('typescript');
    const code = shown.dom.querySelector('pre:not(.linked-code-block pre) code');
    expect(painted('keyword')).toEqual(['const']);
    expect(painted('number')).toEqual(['4']);
    expect(code?.querySelectorAll('.de-code-token')).toHaveLength(0);
    expect(code?.textContent).toBe('const size = 4;');
    const linked = shown.dom.querySelector('[data-linked-code-block] code');
    expect(tokens(linked, 'keyword')).toEqual(['return']);
    expect(tokens(linked, 'string')).toEqual(['"a"']);
    expect(linked?.textContent).toBe('return "a";');
  });

  it('DOCE-OBJECTS-3.3 highlights again as the code or its language changes', () => {
    const shown = viewOfCode('plaintext', 'none');
    expect(painted('keyword')).toEqual([]);
    shown.dispatch(shown.state.tr.setSelection(TextSelection.create(shown.state.doc, 2)));
    setCodeLanguage('typescript')(shown.state, shown.dispatch);
    expect(painted('keyword')).toEqual(['const']);
    shown.dispatch(shown.state.tr.insertText('let ', 1));
    expect(painted('keyword')).toEqual(['let', 'const']);
    expect(tokens(shown.dom.querySelector('[data-linked-code-block] code'), 'keyword')).toEqual([]);
    shown.destroy();
    expect(painted('keyword')).toEqual([]);
  });

  it('DOCE-OBJECTS-3.3 keeps the painting of a code block a change did not touch', () => {
    const shown = viewOfCode('typescript');
    const before = [...(highlights.get(codeHighlightName('keyword')) ?? [])];
    // A change before the code block, which moves it, as the pages' layouts do.
    shown.dispatch(shown.state.tr.insert(0, nodes.paragraph?.create() ?? []));
    expect([...(highlights.get(codeHighlightName('keyword')) ?? [])]).toEqual(before);
    expect(painted('keyword')).toEqual(['const']);
  });
});
