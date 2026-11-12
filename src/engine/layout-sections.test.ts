import type { Node } from 'prosemirror-model';
import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import {
  activeLayoutPreset,
  createLayoutSections,
  insertLayoutSectionBelow,
  moveLayoutSection,
  removeLayoutSection,
  setLayoutPreset,
} from './index.js';

const paragraph = (text: string): StoredNode => ({
  type: 'paragraph',
  content: text ? [{ type: 'text', text }] : [],
});
const columns = (preset: string, ...texts: string[]): StoredNode => ({
  type: 'columns',
  attrs: { preset },
  content: texts.map((text) => ({ type: 'column', content: [paragraph(text)] })),
});
const read = (...content: StoredNode[]) =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema).doc;

function positionOf(doc: Node, text: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(text))
      found = pos + node.text.indexOf(text);
    return found < 0;
  });
  return found;
}

// A state with the caret in some text, or at the first text position.
function stateAt(doc: Node, text: string | null, plugins = [createLayoutSections()]) {
  const state = EditorState.create({ doc, plugins });
  const pos = text === null ? TextSelection.atStart(doc).from : positionOf(doc, text);
  return state.apply(state.tr.setSelection(TextSelection.create(doc, pos)));
}

function run(state: EditorState, command: Command): EditorState {
  let next = state;
  expect(command(state, (tr) => (next = next.apply(tr)))).toBe(true);
  return next;
}

const outline = (state: EditorState) =>
  state.doc
    .child(0)
    .child(0)
    .child(1)
    .children.map((block) =>
      block.type.name === 'layout_section'
        ? `${String(block.attrs.preset)}[${block.children.map((column) => column.textContent).join('|')}]`
        : block.textContent,
    );

const caretText = (state: EditorState) => state.selection.$from.parent.textContent;

describe('layout section commands', () => {
  it('DOCE-LAYOUT-2.1 inserts a section of a preset below a block, or in place of an empty paragraph', () => {
    let state = run(stateAt(read(paragraph('Lead')), 'Lead'), setLayoutPreset('halves'));
    expect(outline(state)).toEqual(['Lead', 'halves[|]']);
    expect(activeLayoutPreset(state)).toBe('halves');
    state = run(stateAt(read(paragraph('')), null), setLayoutPreset('thirds'));
    expect(outline(state)).toEqual(['thirds[||]']);
    expect(setLayoutPreset('unknown')(state)).toBe(false);
  });

  it('DOCE-LAYOUT-2.2 changes a preset, moving the columns it no longer holds into sections below', () => {
    const grown = run(stateAt(read(columns('single', 'A')), 'A'), setLayoutPreset('thirds'));
    expect(outline(grown)).toEqual(['thirds[A||]']);
    const doc = read(columns('thirds', 'A', '', 'C'));
    const shrunk = run(stateAt(doc, 'C'), setLayoutPreset('single'));
    expect(outline(shrunk)).toEqual(['single[A]', 'single[C]']);
    expect(caretText(shrunk)).toBe('C');
    const halves = run(
      stateAt(read(columns('thirds', 'A', 'B', 'C')), 'B'),
      setLayoutPreset('halves'),
    );
    expect(outline(halves)).toEqual(['halves[A|B]', 'halves[C|]']);
    expect(caretText(halves)).toBe('B');
  });

  it('DOCE-LAYOUT-2.3 adds an empty section below, and moves a section past its neighbours', () => {
    const doc = read(paragraph('Before'), columns('halves', 'Left', 'Right'), paragraph('After'));
    const added = run(stateAt(doc, 'Left'), insertLayoutSectionBelow);
    expect(outline(added)).toEqual(['Before', 'halves[Left|Right]', 'halves[|]', 'After']);
    const up = run(stateAt(doc, 'Right'), moveLayoutSection(-1));
    expect(outline(up)).toEqual(['halves[Left|Right]', 'Before', 'After']);
    expect(caretText(up)).toBe('Right');
    const down = run(stateAt(doc, 'Left'), moveLayoutSection(1));
    expect(outline(down)).toEqual(['Before', 'After', 'halves[Left|Right]']);
    expect(moveLayoutSection(1)(down)).toBe(false);
  });

  it('DOCE-LAYOUT-2.4 removes a section, leaving an empty one-column section in place of the last', () => {
    const doc = read(columns('halves', 'A', 'B'), paragraph('After'));
    expect(outline(run(stateAt(doc, 'A'), removeLayoutSection))).toEqual(['After']);
    const only = run(stateAt(read(columns('halves', 'A', 'B')), 'A'), removeLayoutSection);
    expect(outline(only)).toEqual(['single[]']);
    expect(removeLayoutSection(stateAt(read(paragraph('Plain')), 'Plain'))).toBe(false);
  });
});

describe('layout sections plugin', () => {
  it('DOCE-LAYOUT-2.5 keeps local edits in sections, and leaves remote ones as they are', () => {
    const remote = new Set<object>();
    const plugins = [createLayoutSections({ keepWrapped: true, isRemote: (tr) => remote.has(tr) })];
    const state = stateAt(read(columns('single', 'A')), 'A', plugins);
    const at = state.doc.child(0).child(0).child(1);
    // Past the text, its paragraph, its column and its section: the page content's end.
    const end = positionOf(state.doc, 'A') + 1 + 3;
    const block = (text: string) =>
      documentSchema.node('paragraph', null, documentSchema.text(text));
    const local = state.applyTransaction(state.tr.insert(end, block('L'))).state;
    expect(outline(local)).toEqual(['single[A]', 'single[L]']);
    const tr = state.tr.insert(end, block('R'));
    remote.add(tr);
    expect(outline(state.applyTransaction(tr).state)).toEqual(['single[A]', 'R']);
    expect(at.childCount).toBe(1);
  });

  it('DOCE-LAYOUT-2.6 pastes a section as its columns where sections are not kept', () => {
    const doc = read(paragraph('Target'));
    const view = new EditorView(document.createElement('div'), {
      state: stateAt(doc, 'Target'),
    });
    const source = read(columns('halves', 'A', 'B'));
    let from = 0;
    source.descendants((node, pos) => {
      if (node.type.name === 'layout_section') from = pos;
      return !from;
    });
    const slice = source.slice(from, from + (source.nodeAt(from)?.nodeSize ?? 0));
    const pasted = view.someProp('transformPasted', (transform) => transform(slice, view, false));
    expect(pasted?.content.firstChild?.type.name).toBe('paragraph');
    expect(pasted?.content.textBetween(0, pasted.content.size, '|')).toBe('A|B');
    view.destroy();
  });
});
