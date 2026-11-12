import type { Node } from 'prosemirror-model';
import { type Command, EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  createDocumentKit,
  readDocumentFile,
  type StoredNode,
  type TemplateFile,
} from '../model/index.js';
import {
  createDocumentEditing,
  createDocumentEditingExtension,
  documentKeys,
} from './document-editing.js';
import {
  assignElementIds,
  createElementIds,
  ELEMENT_ID_PATTERN,
  repairElementIds,
} from './element-ids.js';

const text = (value: string): StoredNode[] => (value ? [{ type: 'text', text: value }] : []);
const paragraph = (value: string, attrs: Record<string, unknown> = {}): StoredNode => ({
  type: 'paragraph',
  attrs,
  content: text(value),
});
const item = (value: string): StoredNode => ({ type: 'listItem', content: [paragraph(value)] });
const bullets = (...values: string[]): StoredNode => ({
  type: 'bulletList',
  content: values.map(item),
});
const read = (...content: StoredNode[]) =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema).doc;

function positionOf(doc: Node, value: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(value))
      found = pos + node.text.indexOf(value);
    return found < 0;
  });
  return found;
}

const NUMBERED: TemplateFile = {
  formatVersion: 1,
  id: 'numbered',
  styles: { paragraph: { numbering: { format: '1.1' } } },
};

function stateAt(
  doc: Node,
  at: string | [string, string],
  plugins = createDocumentEditing(documentSchema),
) {
  const state = EditorState.create({ doc, plugins });
  const [from, to] = typeof at === 'string' ? [at, at] : at;
  const start = positionOf(doc, from);
  const end = typeof at === 'string' ? start : positionOf(doc, to) + to.length;
  return state.apply(state.tr.setSelection(TextSelection.create(doc, start, end)));
}

function run(state: EditorState, command: Command | undefined): EditorState {
  let next = state;
  expect(command?.(state, (tr) => (next = next.applyTransaction(tr).state))).toBe(true);
  return next;
}

const hasStrong = (state: EditorState) => {
  const type = state.schema.marks.strong;
  return Boolean(type && state.doc.rangeHasMark(state.selection.from, state.selection.to, type));
};

const key = (name: string, template?: () => TemplateFile) =>
  documentKeys(documentSchema, template)[name];

// The top-level blocks of the first page.
const body = (state: EditorState) => state.doc.child(0).child(0).child(1);
const outline = (state: EditorState) =>
  body(state).children.map((block) => `${block.type.name}:${block.textContent}`);

describe('element ids', () => {
  it('DOCE-EDITING-1.1 gives each element a fresh id, unique in the document', () => {
    let state = stateAt(read(paragraph('Alpha blue', { id: '0000000a' })), 'blue');
    state = run(state, key('Enter'));
    const [first, second] = body(state).children;
    expect(first?.attrs.dataId).toBe('0000000a');
    expect(String(second?.attrs.dataId)).toMatch(ELEMENT_ID_PATTERN);
    expect(second?.attrs.dataId).not.toBe('0000000a');
    const repaired = read(paragraph('A', { id: 'd0d0d0d0' }), paragraph('B', { id: 'd0d0d0d0' }));
    const tr = EditorState.create({ doc: repaired }).tr;
    expect(assignElementIds(tr, { newId: () => 'feedbeef' })).toBe(true);
    expect(tr.doc.child(0).child(0).child(1).child(1).attrs.dataId).toBe('feedbeef');
  });

  it('DOCE-EDITING-1.2 attributes the elements a local change adds to the writer', () => {
    const plugins = createDocumentEditing(documentSchema, { author: () => 'writer' });
    const doc = read(paragraph('Alpha blue', { id: '0000000a', author: 'first' }));
    const state = run(stateAt(doc, 'blue', plugins), key('Enter'));
    const [first, second] = body(state).children;
    expect(first?.attrs.dataAuthor).toBe('first');
    expect(second?.attrs.dataAuthor).toBe('writer');
  });

  it('DOCE-EDITING-1.3 leaves remote, pagination and typing changes as they are', () => {
    const newId = vi.fn(() => '0000000b');
    const remote = new Set<Transaction>();
    const plugin = createElementIds({ newId, isRemote: (tr) => remote.has(tr) });
    const state = stateAt(read(paragraph('Alpha', { id: '0000000a' })), 'Alpha', [plugin]);
    const block = documentSchema.node('paragraph', { dataId: '0000000a' });
    const end = positionOf(state.doc, 'Alpha') + 'Alpha'.length + 1;
    const fromElsewhere = state.tr.insert(end, block);
    remote.add(fromElsewhere);
    state.applyTransaction(fromElsewhere);
    state.applyTransaction(state.tr.insert(end, block).setMeta('addToHistory', false));
    state.applyTransaction(state.tr.insertText('!'));
    expect(newId).not.toHaveBeenCalled();
    const doc = read(paragraph('A', { id: '0000000a' }), paragraph('B', { id: '0000000a' }));
    const tr = EditorState.create({ doc }).tr;
    tr.doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph')
        tr.setNodeMarkup(pos, null, { ...node.attrs, splitPartIndex: pos > 10 ? 1 : 0 });
      return true;
    });
    expect(assignElementIds(tr, { newId })).toBe(false);
  });
});

describe('document keys', () => {
  it('DOCE-EDITING-2.1 formats text and sets block types', () => {
    let state = stateAt(read(paragraph('Alpha')), ['Alpha', 'Alpha']);
    state = run(state, key('Mod-b'));
    expect(hasStrong(state)).toBe(true);
    state = run(state, key('Mod-Shift-2'));
    expect(outline(state)).toEqual(['heading:Alpha']);
    expect(body(state).child(0).attrs.level).toBe(2);
    state = run(state, key('Mod-\\'));
    expect(outline(state)).toEqual(['paragraph:Alpha']);
    expect(hasStrong(state)).toBe(false);
  });

  it('DOCE-EDITING-2.1 keeps the id and author of a block whose type changes', () => {
    const doc = read(
      paragraph('Alpha', { id: '0000abcd', author: 'person-1', style: 'note', level: 3 }),
    );
    let state = stateAt(doc, 'Alpha');
    state = run(state, key('Mod-Shift-2'));
    const heading = body(state).child(0);
    expect(heading.type.name).toBe('heading');
    expect(heading.attrs).toMatchObject({ level: 2, dataId: '0000abcd', dataAuthor: 'person-1' });
    state = run(state, key('Mod-Shift-0'));
    const block = body(state).child(0);
    expect(block.type.name).toBe('paragraph');
    expect(block.attrs).toMatchObject({ dataId: '0000abcd', dataAuthor: 'person-1' });
    expect(block.attrs).toMatchObject({ className: '', paragraphLevel: 1 });
  });

  it('DOCE-EDITING-2.2 wraps lists that join their neighbours, and nests and removes items', () => {
    let state = stateAt(read(bullets('One'), paragraph('Two')), 'Two');
    state = run(state, key('Mod-Shift-8'));
    expect(outline(state)).toEqual(['bullet_list:OneTwo']);
    state = run(state, key('Tab'));
    expect(body(state).child(0).child(0).childCount).toBe(2);
    state = run(state, key('Shift-Tab'));
    expect(body(state).child(0).childCount).toBe(2);
    state = run(stateAt(read(bullets('One', '')), 'One'), (s, d) => {
      const pos = s.doc.resolve(positionOf(s.doc, 'One') + 3).after(-1) + 2;
      d?.(s.tr.setSelection(TextSelection.create(s.doc, pos)));
      return true;
    });
    state = run(state, key('Backspace'));
    expect(body(state).child(0).childCount).toBe(1);
  });

  it('DOCE-EDITING-2.3 splits a paragraph with Enter, keeping its level', () => {
    const doc = read(paragraph('Alpha blue', { level: 2 }));
    const state = run(stateAt(doc, 'blue'), key('Enter'));
    expect(outline(state)).toEqual(['paragraph:Alpha ', 'paragraph:blue']);
    expect(body(state).children.map((block) => block.attrs.paragraphLevel)).toEqual([2, 2]);
  });

  it('DOCE-EDITING-2.3 keeps the id with the content when Enter splits at a block start', () => {
    const plugins = createDocumentEditing(documentSchema, { author: () => 'writer' });
    const heading: StoredNode = {
      type: 'heading',
      attrs: { level: 2, id: '0000000a', author: 'first' },
      content: text('Title'),
    };
    let state = run(stateAt(read(heading), 'Title', plugins), key('Enter'));
    const [empty, title] = body(state).children;
    expect(title?.attrs).toMatchObject({ dataId: '0000000a', dataAuthor: 'first', level: 2 });
    expect(title?.type.name).toBe('heading');
    expect(String(empty?.attrs.dataId)).toMatch(ELEMENT_ID_PATTERN);
    expect(empty?.attrs).toMatchObject({ dataAuthor: 'writer' });
    expect(empty?.attrs.dataId).not.toBe('0000000a');
    expect(state.selection.$from.parent).toBe(title);

    const list: StoredNode = {
      type: 'bulletList',
      attrs: { id: '0000000b' },
      content: [
        {
          type: 'listItem',
          attrs: { id: '0000000c' },
          content: [paragraph('One', { id: '0000000d' })],
        },
      ],
    };
    state = run(stateAt(read(list), 'One', plugins), key('Enter'));
    const items = body(state).child(0).children;
    expect(items.map((each) => each.textContent)).toEqual(['', 'One']);
    expect(items[1]?.attrs.dataId).toBe('0000000c');
    expect(items[1]?.child(0).attrs.dataId).toBe('0000000d');
    expect(items[0]?.attrs.dataId).not.toBe('0000000c');
    expect(items[0]?.child(0).attrs.dataId).not.toBe('0000000d');
  });

  it('DOCE-EDITING-2.4 joins text across a page break with Backspace and Delete', () => {
    const block = (value: string, id: string) =>
      value === '|'
        ? documentSchema.node('page_break')
        : documentSchema.node('paragraph', { dataId: id }, documentSchema.text(value));
    const pageOf = (blocks: Node[]) =>
      documentSchema.node('page', null, [
        documentSchema.node('page_header'),
        documentSchema.node('page_content', null, blocks),
        documentSchema.node('page_footnotes'),
        documentSchema.node('page_footer'),
      ]);
    const paged = (first: Node[], second: Node[]) =>
      documentSchema.node('doc', null, [
        documentSchema.node('page_section', null, [pageOf(first), pageOf(second)]),
      ]);
    const texts = (state: EditorState) => {
      const all: string[] = [];
      state.doc.descendants((node) => {
        if (node.isTextblock) all.push(node.textContent);
        return !node.isTextblock;
      });
      return all;
    };
    const split = paged([block('Alpha', 'aaaaaaaa')], [block('blue', 'aaaaaaaa')]);
    expect(texts(run(stateAt(split, 'blue'), key('Backspace')))).toEqual(['Alph', 'blue']);
    const two = paged([block('Alpha', 'aaaaaaaa')], [block('Blue', 'bbbbbbbb')]);
    expect(texts(run(stateAt(two, 'Blue'), key('Backspace')))).toEqual(['AlphaBlue']);
    const atEnd = stateAt(two, 'Alpha');
    const end = atEnd.apply(
      atEnd.tr.setSelection(TextSelection.create(two, positionOf(two, 'Alpha') + 5)),
    );
    expect(texts(run(end, key('Delete')))).toEqual(['AlphaBlue']);
    const broken = paged([block('Alpha', 'aaaaaaaa'), block('|', '')], [block('Blue', 'bbbbbbbb')]);
    const selected = run(stateAt(broken, 'Blue'), key('Backspace'));
    expect(selected.selection.from).toBe(positionOf(broken, 'Alpha') + 6);
    expect(texts(run(selected, key('Backspace')))).toEqual(['Alpha', 'Blue']);
  });

  it('DOCE-EDITING-2.5 changes paragraph levels with Tab where the template numbers paragraphs', () => {
    const doc = read(paragraph('Alpha'));
    let state = run(
      stateAt(doc, 'Alpha'),
      key('Tab', () => NUMBERED),
    );
    expect(body(state).child(0).attrs.paragraphLevel).toBe(2);
    state = run(
      state,
      key('Shift-Tab', () => NUMBERED),
    );
    expect(body(state).child(0).attrs.paragraphLevel).toBe(1);
    const plain = run(stateAt(doc, 'Alpha'), key('Tab'));
    expect(body(plain).child(0).attrs.paragraphLevel).toBe(1);
  });

  it('DOCE-EDITING-2.6 selects the body, and inserts a page break at the caret', () => {
    let state = run(stateAt(read(paragraph('Alpha'), paragraph('Omega')), 'Alpha'), key('Mod-a'));
    expect(state.doc.textBetween(state.selection.from, state.selection.to)).toBe('AlphaOmega');
    state = run(stateAt(read(paragraph('Alpha')), 'pha'), key('Mod-Alt-Enter'));
    expect(outline(state)).toEqual(['paragraph:Al', 'page_break:', 'paragraph:pha']);
    expect(state.selection.$from.parent.textBetween(0, 3)).toBe('pha');
    state = run(stateAt(read(paragraph('Alpha')), 'Alpha'), key('Mod-Alt-Enter'));
    expect(outline(state)).toEqual(['page_break:', 'paragraph:Alpha']);
    state = run(stateAt(read(bullets('One')), 'One'), key('Mod-Alt-Enter'));
    expect(outline(state)).toEqual(['bullet_list:One', 'page_break:', 'paragraph:']);
  });
});

describe('the editing extension', () => {
  it('DOCE-EDITING-3.1 installs the history, the element ids, tables and the keymaps in a kit', () => {
    const kit = createDocumentKit({ extensions: [createDocumentEditingExtension()] });
    expect(kit.pluginOrder).toEqual([
      'history',
      'edit-lock',
      'element-ids',
      'footnotes',
      'comment-draft',
      'math-views',
      'object-views',
      'clipboard',
      'scripts',
      'custom-styles',
      'paragraph-numbering',
      'variable-tokens',
      'table-width',
      'tables',
      'gap-cursor',
      'keymap',
    ]);
    expect(kit.buildPlugins(undefined)).toHaveLength(16);
    const shared = createDocumentKit({
      extensions: [createDocumentEditingExtension({ history: false })],
    });
    expect(shared.buildPlugins(undefined)).toHaveLength(15);
  });

  it('DOCE-EDITING-4.2 locks the sections the template does not let be edited, beside the host lock', () => {
    const template: TemplateFile = {
      formatVersion: 1,
      id: 'locked',
      sections: [{ name: 'cover', editable: false }],
    };
    const doc = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          { name: 'cover', content: [paragraph('Cover')] },
          { name: null, content: [paragraph('Body'), paragraph('Held')] },
        ],
      },
      documentSchema,
    ).doc;
    const isLocked = (at: Node, pos: number) => at.resolve(pos).parent.textContent === 'Held';
    const state = EditorState.create({
      doc,
      plugins: createDocumentEditing(documentSchema, { template: () => template, isLocked }),
    });
    const typedAt = (value: string) =>
      state.apply(state.tr.insertText('!', positionOf(doc, value) + 1)).doc.textContent;
    expect(typedAt('Cover')).not.toContain('!');
    expect(typedAt('Held')).not.toContain('!');
    expect(typedAt('Body')).toContain('B!ody');
    const unlocked = EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) });
    const typed = unlocked.apply(unlocked.tr.insertText('!', positionOf(doc, 'Cover') + 1)).doc;
    const typedText = typed.textContent;
    expect(typedText).toMatch(/C!over/);
  });

  it('DOCE-EDITING-2.7 selects an object before deleting it', () => {
    const keys = documentKeys(documentSchema);
    const table: StoredNode = {
      type: 'table',
      content: [
        { type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph('Cell')] }] },
      ],
    };
    let state = stateAt(read(table, paragraph('After')), 'After');
    state = run(state, keys.Backspace as Command);
    // The table is selected whole, as cells, and still there; the next press deletes it.
    expect(state.selection.empty).toBe(false);
    expect(state.doc.textBetween(state.selection.from, state.selection.to)).toBe('Cell');
    state = run(state, keys.Backspace as Command);
    expect(state.doc.textBetween(0, state.doc.content.size)).toBe('After');
  });

  it('DOCE-EDITING-2.8 keeps a footnote entry one paragraph under Enter, Backspace and Delete', () => {
    const cited: StoredNode = {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Body' },
        { type: 'footnote', attrs: { id: 'n1' }, content: [{ type: 'text', text: 'Note text' }] },
      ],
    };
    const keys = documentKeys(documentSchema);
    const state = stateAt(read(cited), 'Note text');
    const entry = state.selection.$from.parent;
    expect(entry.type.name).toBe('footnote_entry');
    for (const key of ['Enter', 'Shift-Enter', 'Backspace'] as const) {
      const next = run(state, keys[key] as Command);
      expect(next.doc.eq(state.doc)).toBe(true);
    }
  });

  it('DOCE-EDITING-1.4 repairs the element ids a document opens with, out of the history', () => {
    const state = EditorState.create({ doc: read(paragraph('One'), paragraph('Two')) });
    const tr = repairElementIds(state);
    expect(tr?.getMeta('addToHistory')).toBe(false);
    const repaired = state.apply(tr as Transaction);
    const ids: unknown[] = [];
    repaired.doc.descendants((node) => {
      if (node.type.name === 'paragraph') ids.push(node.attrs.dataId);
    });
    expect(ids.every((id) => typeof id === 'string' && ELEMENT_ID_PATTERN.test(id))).toBe(true);
    expect(repairElementIds(repaired)).toBeNull();
  });

  it('DOCE-EDITING-1.4 keeps the ids of the header rows a split table repeats', () => {
    const header: StoredNode = {
      type: 'tableRow',
      content: [{ type: 'tableHeader', content: [paragraph('Name')] }],
    };
    const body: StoredNode = {
      type: 'tableRow',
      content: [{ type: 'tableCell', content: [paragraph('First')] }],
    };
    let state = EditorState.create({ doc: read({ type: 'table', content: [header, body] }) });
    state = state.apply(repairElementIds(state) as Transaction);
    let after = -1;
    state.doc.descendants((node, pos) => {
      if (node.type.name === 'table') after = pos + node.nodeSize;
      return after < 0;
    });
    const table = state.doc.resolve(after).nodeBefore;
    if (!table) throw new Error('The document has a table');
    // The later part repeats the header row only.
    const part = table.type.create({ ...table.attrs, splitPartIndex: 1 }, [table.child(0)]);
    const first = table.type.create({ ...table.attrs, splitPartIndex: 0 }, table.content);
    const split = state.apply(state.tr.replaceWith(after - table.nodeSize, after, [first, part]));
    expect(repairElementIds(split)).toBeNull();
  });
});
