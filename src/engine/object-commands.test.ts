import { type Command, EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import {
  convertMath,
  insertCharacter,
  insertCodeBlock,
  insertContents,
  insertMath,
  parseCodeLines,
  setCodeLanguage,
  setContentsDepth,
  setFigure,
  setLinkedCode,
  setMathSource,
  setObjectLayout,
} from './object-commands.js';

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const paragraph = (value: string): StoredNode => ({
  type: 'paragraph',
  content: value ? [text(value)] : [],
});

const stateOf = (...content: StoredNode[]) =>
  EditorState.create({
    doc: readDocumentFile(
      { formatVersion: 1, sections: [{ name: null, content }] },
      documentSchema,
    ),
  });

function find(state: EditorState, value: string) {
  let found = -1;
  state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(value)) {
      found = pos + (node.text.indexOf(value) ?? 0);
    }
    return found < 0;
  });
  return found;
}

const select = (state: EditorState, value: string, length = 0) => {
  const from = find(state, value);
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, from + length)));
};

const atStart = (state: EditorState) =>
  state.apply(state.tr.setSelection(TextSelection.atStart(state.doc)));

function run(state: EditorState, command: Command): EditorState {
  let next = state;
  expect(command(state, (tr) => (next = next.apply(tr)))).toBe(true);
  return next;
}

// The top-level blocks of the first page, as type and text.
const outline = (state: EditorState) =>
  state.doc
    .child(0)
    .child(0)
    .child(1)
    .children.map((block) => `${block.type.name}:${block.textContent}`);

describe('object commands', () => {
  it('DOCE-OBJECTS-1.1 turns the selected lines into a code block and sets its language', () => {
    let state = stateOf(paragraph('let a = 1;'), paragraph('let b = 2;'), paragraph('After'));
    const from = find(state, 'let a');
    const to = find(state, 'b = 2;') + 'b = 2;'.length;
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
    state = run(state, insertCodeBlock('typescript'));
    expect(outline(state)).toEqual(['code_block:let a = 1;\nlet b = 2;', 'paragraph:After']);
    state = run(state, setCodeLanguage('javascript'));
    expect(state.doc.child(0).child(0).child(1).child(0).attrs.language).toBe('javascript');
    state = run(select(stateOf(paragraph('Text')), 'Text'), insertCodeBlock());
    expect(outline(state)).toEqual(['paragraph:Text', 'code_block:']);
  });

  it('DOCE-OBJECTS-1.2 inserts linked code and reads the lines a URL names', () => {
    const state = run(
      select(stateOf(paragraph('Intro')), 'Intro'),
      setLinkedCode({ url: 'https://example.com/a.ts#L3-L5', code: 'x\ny\nz', startLine: 3 }),
    );
    expect(state.selection).toBeInstanceOf(NodeSelection);
    expect((state.selection as NodeSelection).node.attrs).toMatchObject({
      startLine: 3,
      code: 'x\ny\nz',
    });
    expect(parseCodeLines('https://example.com/a.ts#L3-L5')).toEqual({ from: 3, to: 5 });
    expect(parseCodeLines('https://example.com/a.ts#L7')).toEqual({ from: 7, to: 7 });
    expect(parseCodeLines('https://example.com/a.ts')).toBeNull();
  });

  it('DOCE-OBJECTS-1.3 inserts, edits, converts and removes math', () => {
    let state = run(select(stateOf(paragraph('Energy is ')), 'is ', 3), insertMath('E=mc^2'));
    expect((state.selection as NodeSelection).node.type.name).toBe('math_inline');
    state = run(state, setMathSource('E = mc^2'));
    state = state.apply(
      state.tr.setSelection(NodeSelection.create(state.doc, find(state, 'E = mc^2') - 1)),
    );
    state = run(state, convertMath);
    expect((state.selection as NodeSelection).node.type.name).toBe('math_display');
    state = run(state, setMathSource(''));
    expect(state.doc.textBetween(0, state.doc.content.size)).not.toContain('mc^2');
    expect(insertMath('  ')(state)).toBe(false);
  });

  it('DOCE-OBJECTS-1.4 inserts a figure, then changes and aligns it', () => {
    let state = run(
      atStart(stateOf(paragraph(''))),
      setFigure({ src: 'https://example.com/a.png', alt: 'A', width: 320 }),
    );
    const figure = () => (state.selection as NodeSelection).node;
    expect(figure().attrs).toMatchObject({ figureType: 'image', alt: 'A', width: 320 });
    state = run(state, setFigure({ width: 200, height: 100 }));
    expect(figure().attrs).toMatchObject({ width: 200, height: 100, alt: 'A' });
    state = run(state, setObjectLayout('center'));
    expect(figure().attrs.objectLayout).toBe('center');
  });

  it('DOCE-OBJECTS-1.5 inserts a list of contents, sets its depth, and types a symbol', () => {
    let state = run(select(stateOf(paragraph('Intro')), 'Intro'), insertContents('figures'));
    expect((state.selection as NodeSelection).node.attrs.tocType).toBe('figures');
    state = run(state, setContentsDepth(2));
    expect((state.selection as NodeSelection).node.attrs.minLevel).toBe(2);
    state = run(select(stateOf(paragraph('ab')), 'b'), insertCharacter('Ω'));
    expect(state.doc.textBetween(0, state.doc.content.size)).toBe('aΩb');
  });
});
