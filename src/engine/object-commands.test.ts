import {
  type Command,
  EditorState,
  NodeSelection,
  TextSelection,
  type Transaction,
} from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { parseCodeLines, readDocumentFile, type StoredNode } from '../model/index.js';
import { documentKeys } from './document-editing.js';
import {
  convertMath,
  insertCharacter,
  insertCodeBlock,
  insertContents,
  insertFigure,
  insertMath,
  linkAt,
  setCodeLanguage,
  setContentsDepth,
  setFigure,
  setLink,
  setLinkedCode,
  setMathSource,
  setObjectLayout,
} from './object-commands.js';
import { suggestTransaction } from './suggestions.js';

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const paragraph = (value: string): StoredNode => ({
  type: 'paragraph',
  content: value ? [text(value)] : [],
});

const stateOf = (...content: StoredNode[]) =>
  EditorState.create({
    doc: readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema)
      .doc,
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
    const insertKey = documentKeys(documentSchema)['Mod-Alt-c'];
    if (!insertKey) throw new Error('No key inserts a code block');
    state = run(select(stateOf(paragraph('Text')), 'Text'), insertKey);
    expect(outline(state)).toEqual(['paragraph:Text', 'code_block:']);
  });

  it('DOCE-OBJECTS-1.1 takes the whole text of the blocks a selection only partly covers', () => {
    let state = stateOf(paragraph('Keep this. let a = 1;'), paragraph('let b = 2; keep that.'));
    const from = find(state, 'let a');
    const to = find(state, 'let b') + 'let b = 2;'.length;
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
    state = run(state, insertCodeBlock());
    expect(outline(state)).toEqual(['code_block:Keep this. let a = 1;\nlet b = 2; keep that.']);
    // The caret ends after the code, where the writer goes on typing.
    expect(state.selection.$from.parentOffset).toBe(state.selection.$from.parent.content.size);
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

  it('DOCE-OBJECTS-1.3 refuses to turn math into a block where no block may go', () => {
    const math: StoredNode = { type: 'math', attrs: { source: 'x^2' } };
    const note: StoredNode = {
      type: 'footnote',
      attrs: { id: 'n1' },
      content: [text('See '), math],
    };
    const state = stateOf({ type: 'paragraph', content: [text('Body'), note] });
    let at = -1;
    state.doc.descendants((node, pos) => {
      if (node.type.name === 'math_inline') at = pos;
    });
    const selected = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, at)));
    expect(selected.selection.$from.parent.type.name).toBe('footnote_entry');
    expect(convertMath(selected)).toBe(false);
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

  it('DOCE-OBJECTS-1.4 keeps a diagram a diagram and stores fitting the page width', () => {
    let state = run(
      atStart(stateOf(paragraph(''))),
      insertFigure({ figureType: 'diagram', fileAssetId: 'd1', snapshotId: 's1', width: 400 }),
    );
    const figure = () => (state.selection as NodeSelection).node;
    state = run(state, setFigure({ caption: 'Flow', objectLayout: 'right' }));
    expect(figure().attrs).toMatchObject({
      figureType: 'diagram',
      fileAssetId: 'd1',
      caption: 'Flow',
      objectLayout: 'right',
    });
    state = run(state, setObjectLayout('fit'));
    expect(figure().attrs.objectLayout).toBe('fit-page-width');
  });

  it('DOCE-OBJECTS-1.4 inserts figures one after another, never over the one selected', () => {
    let state = run(
      atStart(stateOf(paragraph(''))),
      insertFigure({ src: 'https://example.com/a.png' }),
    );
    state = run(state, insertFigure({ src: 'https://example.com/b.png' }));
    const sources: unknown[] = [];
    state.doc.descendants((node) => {
      if (node.type.name === 'figure') sources.push(node.attrs.src);
    });
    expect(sources).toEqual(['https://example.com/a.png', 'https://example.com/b.png']);
    expect((state.selection as NodeSelection).node.attrs.src).toBe('https://example.com/b.png');
  });

  it('DOCE-OBJECTS-1.5 inserts a list of contents, sets its depth, and types a symbol', () => {
    let state = run(select(stateOf(paragraph('Intro')), 'Intro'), insertContents('figures'));
    expect((state.selection as NodeSelection).node.attrs.tocType).toBe('figures');
    state = run(state, setContentsDepth(2));
    expect((state.selection as NodeSelection).node.attrs.minLevel).toBe(2);
    state = run(select(stateOf(paragraph('ab')), 'b'), insertCharacter('Ω'));
    expect(state.doc.textBetween(0, state.doc.content.size)).toBe('aΩb');
  });

  it('DOCE-OBJECTS-1.6 links the selection, changes the link at the caret and removes it', () => {
    let state = run(
      select(stateOf(paragraph('See the spec here.')), 'spec', 4),
      setLink('https://a.example'),
    );
    state = select(state, 'pec');
    expect(linkAt(state)).toBe('https://a.example');
    state = run(state, setLink('https://b.example'));
    expect(linkAt(select(state, 'sp'))).toBe('https://b.example');
    state = run(select(state, 'pe'), setLink(''));
    expect(linkAt(select(state, 'pe'))).toBeNull();
    state = run(select(state, 'here'), setLink('https://c.example'));
    expect(state.doc.textBetween(0, state.doc.content.size)).toContain('https://c.examplehere');
    expect(setLink('')(select(state, 'See'))).toBe(false);
  });

  it('DOCE-OBJECTS-1.6 refuses an address that could run script', () => {
    const state = select(stateOf(paragraph('See the spec here.')), 'spec', 4);
    expect(setLink('javascript:alert(1)')(state)).toBe(false);
    expect(setLink(' JavaScript:alert(1)')(state)).toBe(false);
    expect(setLink('mailto:ada@example.com')(state)).toBe(true);
  });

  it('DOCE-OBJECTS-1.6 DOCE-SUGGESTIONS-1.1 types a linked address a suggestion records as an insertion', () => {
    const strong = [{ type: 'bold' }];
    const state = select(
      stateOf({ type: 'paragraph', content: [{ type: 'text', text: 'See here.', marks: strong }] }),
      'here',
    );
    const changes: Transaction[] = [];
    expect(setLink('https://a.example')(state, (tr) => changes.push(tr))).toBe(true);
    const [typed] = changes;
    if (!typed) throw new Error('No change');
    const marksAt = (next: EditorState) =>
      next.doc
        .nodeAt(find(next, 'https://a.example'))
        ?.marks.map((mark) => mark.type.name)
        .sort();
    expect(marksAt(state.apply(typed))).toEqual(['link', 'strong']);
    expect(state.apply(typed).selection.from).toBe(state.selection.from + 17);
    const suggested = suggestTransaction(typed, state, { author: 'ada' });
    if (!suggested) throw new Error('Dropped');
    expect(marksAt(state.apply(suggested))).toEqual(['insertion', 'link', 'strong']);
  });
});
