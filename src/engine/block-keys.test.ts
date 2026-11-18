import { GapCursor } from 'prosemirror-gapcursor';
import type { Node } from 'prosemirror-model';
import { type Command, EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { createDocumentEditing, documentKeys } from './document-editing.js';

const text = (value: string): StoredNode[] => (value ? [{ type: 'text', text: value }] : []);
const paragraph = (value: string): StoredNode => ({ type: 'paragraph', content: text(value) });
const heading = (value: string): StoredNode => ({
  type: 'heading',
  attrs: { level: 2 },
  content: text(value),
});
const cell = (value: string): StoredNode => ({ type: 'tableCell', content: [paragraph(value)] });
const table = (...values: string[]): StoredNode => ({
  type: 'table',
  content: [{ type: 'tableRow', content: values.map(cell) }],
});
const code = (value: string): StoredNode => ({ type: 'codeBlock', content: text(value) });
const quote = (value: string): StoredNode => ({ type: 'blockquote', content: [paragraph(value)] });
const bullets = (...values: string[]): StoredNode => ({
  type: 'bulletList',
  content: values.map((value) => ({ type: 'listItem', content: [paragraph(value)] })),
});

const read = (...sections: StoredNode[][]) =>
  readDocumentFile(
    {
      formatVersion: 1,
      sections: sections.map((content, index) => ({ name: index ? `s${index}` : null, content })),
    },
    documentSchema,
  ).doc;

// Blocks that show no text of their own, as Enter and Backspace meet them.
const OBJECTS: readonly (readonly [string, StoredNode])[] = [
  ['figure', { type: 'figure', attrs: { src: 'https://example.test/a.png', alt: 'A' } }],
  ['page break', { type: 'pageBreak' }],
  ['rule', { type: 'rule' }],
  ['list of contents', { type: 'contents' }],
  ['template block', { type: 'templateBlock', attrs: { source: '<p>Block</p>' } }],
  ['linked code', { type: 'linkedCode', attrs: { url: 'https://example.test/a.ts', code: 'x' } }],
];

const keys = documentKeys(documentSchema);

function positionOf(doc: Node, value: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(value))
      found = pos + node.text.indexOf(value);
    return found < 0;
  });
  return found;
}

function stateAt(doc: Node, at: number) {
  const state = EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) });
  return state.apply(state.tr.setSelection(TextSelection.create(doc, at)));
}

function press(state: EditorState, name: string): EditorState {
  let next = state;
  const handled = (keys[name] as Command)(state, (tr) => (next = next.apply(tr)));
  expect(handled).toBe(true);
  return next;
}

// The first page's top-level blocks, as type and text.
const outline = (doc: Node, section = 0) =>
  doc
    .child(section)
    .child(0)
    .child(1)
    .children.map((block) => `${block.type.name}:${block.textContent}`);

// The position of the first top-level block of a type.
function blockAt(doc: Node, type: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.type.name === type) found = pos;
    return found < 0;
  });
  return found;
}

// Inside the first empty paragraph.
function emptyParagraph(doc: Node): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.type.name === 'paragraph' && node.content.size === 0) found = pos + 1;
    return found < 0;
  });
  return found;
}

describe('Enter beside blocks without text', () => {
  it.each(OBJECTS)(
    'DOCE-EDITING-2.3 adds a paragraph after a selected %s, at the start of the page too',
    (_name, object) => {
      const doc = read([object, paragraph('After')]);
      const state = EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) });
      const at = doc.child(0).child(0).child(1);
      const pos = blockAt(doc, at.child(0).type.name);
      const selected = state.apply(state.tr.setSelection(NodeSelection.create(doc, pos)));
      const next = press(selected, 'Enter');
      const blocks = outline(next.doc);
      expect(blocks).toHaveLength(3);
      expect(blocks[0]).toMatch(new RegExp(`^${at.child(0).type.name}:`));
      expect(blocks.slice(1)).toEqual(['paragraph:', 'paragraph:After']);
      expect(next.selection.$from.parent.type.name).toBe('paragraph');
      expect(next.selection.$from.index(-1)).toBe(1);
    },
  );

  it('DOCE-EDITING-2.7 adds a paragraph at a gap cursor between two objects', () => {
    const doc = read([{ type: 'rule' }, { type: 'pageBreak' }, paragraph('After')]);
    const state = EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) });
    const gap = blockAt(doc, 'page_break');
    const atGap = state.apply(state.tr.setSelection(new GapCursor(doc.resolve(gap))));
    const next = press(atGap, 'Enter');
    expect(outline(next.doc)).toEqual([
      'horizontal_rule:',
      'paragraph:',
      'page_break:',
      'paragraph:After',
    ]);
    expect(next.selection.$from.parent.type.name).toBe('paragraph');
  });
});

describe('Enter in each text block', () => {
  const cases: readonly (readonly [string, StoredNode[], string[]])[] = [
    ['a paragraph', [paragraph('Alpha')], ['paragraph:Al', 'paragraph:pha']],
    ['a heading', [heading('Alpha')], ['heading:Al', 'heading:pha']],
    ['a quote', [quote('Alpha')], ['blockquote:Alpha']],
    ['a list item', [bullets('Alpha')], ['bullet_list:Alpha']],
    ['a table cell', [table('Alpha', 'Beta')], ['table_figure:AlphaBeta']],
    ['a code block', [code('Alpha')], ['code_block:Al\npha']],
  ];

  it.each(cases)(
    'DOCE-EDITING-2.3 splits %s in the middle, within its parent',
    (_name, content, expected) => {
      const doc = read(content);
      const next = press(stateAt(doc, positionOf(doc, 'Alpha') + 2), 'Enter');
      expect(outline(next.doc)).toEqual(expected);
      expect(next.selection.$from.parent.textContent.endsWith('pha')).toBe(true);
    },
  );

  it('DOCE-EDITING-2.3 keeps a table cell split inside the cell, with no new row or column', () => {
    const doc = read([table('Alpha', 'Beta')]);
    const next = press(stateAt(doc, positionOf(doc, 'Alpha') + 5), 'Enter');
    const row = next.doc.child(0).child(0).child(1).child(0).child(1).child(0);
    expect(row.childCount).toBe(2);
    expect(row.child(0).childCount).toBe(2);
    expect(next.selection.$from.node(-1).type.name).toBe('table_cell');
  });
});

describe('Backspace and Delete in each text block', () => {
  it('DOCE-EDITING-2.10 removes an empty first paragraph of a section, the caret at the next block', () => {
    const doc = read([paragraph('Before')], [paragraph(''), heading('Next')]);
    const next = press(stateAt(doc, emptyParagraph(doc)), 'Backspace');
    expect(outline(next.doc, 1)).toEqual(['heading:Next']);
    expect(String(next.selection.$from.parent.textContent)).toBe('Next');
    expect(next.selection.$from.parentOffset).toBe(0);
  });

  it('DOCE-EDITING-2.10 removes an empty paragraph with Delete, the caret at the start of the next block', () => {
    const doc = read([paragraph('One'), paragraph(''), heading('Two')]);
    const next = press(stateAt(doc, emptyParagraph(doc)), 'Delete');
    expect(outline(next.doc)).toEqual(['paragraph:One', 'heading:Two']);
    expect(next.selection.$from.parent.type.name).toBe('heading');
  });

  it('DOCE-EDITING-2.10 joins a heading into the paragraph before it with Backspace, keeping the paragraph', () => {
    const doc = read([paragraph('One'), heading('Two')]);
    const next = press(stateAt(doc, positionOf(doc, 'Two')), 'Backspace');
    expect(outline(next.doc)).toEqual(['paragraph:OneTwo']);
    expect(next.selection.$from.parentOffset).toBe(3);
  });

  it('DOCE-EDITING-2.10 joins the next block with Delete at a block end, keeping this block type', () => {
    const doc = read([heading('One'), paragraph('Two')]);
    const next = press(stateAt(doc, positionOf(doc, 'One') + 3), 'Delete');
    expect(outline(next.doc)).toEqual(['heading:OneTwo']);
  });

  it('DOCE-EDITING-2.10 never joins table cells with Backspace at a cell start or Delete at its end', () => {
    const doc = read([table('Alpha', 'Beta')]);
    for (const [at, name] of [
      [positionOf(doc, 'Beta'), 'Backspace'],
      [positionOf(doc, 'Alpha') + 5, 'Delete'],
    ] as const) {
      const state = stateAt(doc, at);
      let next = state;
      (keys[name] as Command)(state, (tr) => (next = next.apply(tr)));
      expect(outline(next.doc)).toEqual(['table_figure:AlphaBeta']);
      expect(next.doc.child(0).child(0).child(1).child(0).child(1).child(0).childCount).toBe(2);
    }
  });

  it.each(OBJECTS)(
    'DOCE-EDITING-2.7 selects a %s with Backspace after it, then deletes it',
    (_name, object) => {
      const doc = read([paragraph('Before'), object, paragraph('After')]);
      let next = press(stateAt(doc, positionOf(doc, 'After')), 'Backspace');
      expect(next.selection).toBeInstanceOf(NodeSelection);
      next = press(next, 'Backspace');
      expect(outline(next.doc)).toEqual(['paragraph:Before', 'paragraph:After']);
    },
  );

  it.each(OBJECTS)(
    'DOCE-EDITING-2.7 selects a %s with Delete before it, then deletes it',
    (_name, object) => {
      const doc = read([paragraph('Before'), object, paragraph('After')]);
      let next = press(stateAt(doc, positionOf(doc, 'Before') + 6), 'Delete');
      expect(next.selection).toBeInstanceOf(NodeSelection);
      next = press(next, 'Delete');
      expect(outline(next.doc)).toEqual(['paragraph:Before', 'paragraph:After']);
    },
  );
});
