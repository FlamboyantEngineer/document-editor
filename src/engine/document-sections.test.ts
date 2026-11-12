import type { Node } from 'prosemirror-model';
import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import type { DecorationSet } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  BASE_TEMPLATE,
  readDocumentFile,
  type StoredNode,
  type TemplateFile,
  writeDocumentFile,
} from '../model/index.js';
import {
  createDocumentSections,
  documentSectionsKey,
  insertDocumentSection,
  joinDocumentSectionBackward,
} from './document-sections.js';

const paragraph = (value: string): StoredNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text: value }],
});

const TEMPLATE: TemplateFile = {
  ...BASE_TEMPLATE,
  sections: [
    {
      name: 'appendix',
      insertable: true,
      page: { size: 'A4', orientation: 'landscape' },
      styles: { heading1: { numbering: { format: 'A.' } } },
      header: { content: [paragraph('Appendix')] },
      content: [paragraph('Appendix text')],
    },
    { name: 'cover', required: true, insertable: false, editable: false },
  ],
};

const read = (...sections: { name: string | null; content: StoredNode[] }[]) =>
  readDocumentFile({ formatVersion: 1, sections }, documentSchema).doc;

// Each section as its name and its blocks' text.
const outline = (doc: Node) =>
  writeDocumentFile(doc).sections.map(
    (section) =>
      `${section.name ?? '-'}:${section.content
        .map((block) => (block.content ?? []).map((child) => child.text ?? '').join(''))
        .join(',')}`,
  );

function positionOf(doc: Node, value: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(value)) found = pos;
    return found < 0;
  });
  return found;
}

function stateAt(doc: Node, value: string) {
  const state = EditorState.create({ doc });
  return state.apply(state.tr.setSelection(TextSelection.create(doc, positionOf(doc, value))));
}

function run(state: EditorState, command: Command): EditorState | null {
  let next: EditorState | null = null;
  const done = command(state, (tr) => {
    next = state.apply(tr);
  });
  return done ? next : null;
}

const caretText = (state: EditorState | null) => state?.selection.$from.parent.textContent;

describe('section scopes', () => {
  it('DOCE-SECTIONS-1.1 sets each named section its template values, restarts and editing', () => {
    const doc = read(
      { name: 'cover', content: [paragraph('Cover')] },
      { name: null, content: [paragraph('Body')] },
      { name: 'appendix', content: [paragraph('Extra')] },
    );
    const state = EditorState.create({
      doc,
      plugins: [createDocumentSections({ template: () => TEMPLATE })],
    });
    const set = documentSectionsKey.getState(state) as DecorationSet;
    const found = set.find();
    expect(found).toHaveLength(2);
    const attrs = found.map(
      (decoration) =>
        (decoration as unknown as { type: { attrs: Record<string, string> } }).type.attrs,
    );
    expect(attrs[0]?.contenteditable).toBe('false');
    expect(attrs[1]?.['data-numbering']).toBe('restart');
    expect(attrs[1]?.style).toMatch(/--doc-page-width: [\d.]+px/);
    const width = (style = '') => Number(/--doc-page-width: ([\d.]+)px/.exec(style)?.[1]);
    const height = (style = '') => Number(/--doc-page-height: ([\d.]+)px/.exec(style)?.[1]);
    expect(width(attrs[1]?.style)).toBeGreaterThan(height(attrs[1]?.style));
  });

  it('DOCE-SECTIONS-1.3 shows an empty section its placeholder', () => {
    const template: TemplateFile = {
      ...TEMPLATE,
      sections: [{ name: 'summary', placeholder: [paragraph('Summarise the results.')] }],
    };
    const state = (content: StoredNode[]) =>
      EditorState.create({
        doc: read({ name: 'summary', content }),
        plugins: [createDocumentSections({ template: () => template })],
      });
    const widgets = (current: EditorState) =>
      (documentSectionsKey.getState(current)?.find() ?? []).filter((decoration) =>
        String((decoration.spec as { key?: string }).key ?? '').startsWith('placeholder'),
      );
    expect(widgets(state([{ type: 'paragraph' }]))).toHaveLength(1);
    expect(widgets(state([paragraph('Written')]))).toHaveLength(0);
  });

  it('DOCE-SECTIONS-1.2 keeps each page header its section’s, outside the history', () => {
    const doc = read(
      { name: null, content: [paragraph('Body')] },
      { name: 'appendix', content: [paragraph('Extra')] },
    );
    const state = EditorState.create({
      doc,
      plugins: [createDocumentSections({ template: () => TEMPLATE })],
    });
    const { state: next, transactions } = state.applyTransaction(
      state.tr.setMeta(documentSectionsKey, true),
    );
    const headers = (value: EditorState) => {
      const all: string[] = [];
      value.doc.descendants((node) => {
        if (node.type.name === 'page_header') all.push(node.textContent);
        return node.type.name !== 'page_header';
      });
      return all;
    };
    expect(headers(next)).toEqual(['', 'Appendix']);
    expect(transactions.at(-1)?.getMeta('addToHistory')).toBe(false);
    expect(next.apply(next.tr.setMeta(documentSectionsKey, true)).doc.eq(next.doc)).toBe(true);
  });
});

describe('section commands', () => {
  const doc = () =>
    read(
      { name: 'cover', content: [paragraph('Cover')] },
      { name: null, content: [paragraph('One'), paragraph('Two'), paragraph('Three')] },
    );

  it('DOCE-SECTIONS-2.1 starts a section after the caret’s block, with the blocks after it', () => {
    const next = run(stateAt(doc(), 'Two'), insertDocumentSection(TEMPLATE, 'appendix'));
    expect(next && outline(next.doc)).toEqual(['cover:Cover', '-:One,Two', 'appendix:Three']);
    expect(caretText(next)).toBe('Three');
    const empty = run(stateAt(doc(), 'Three'), insertDocumentSection(TEMPLATE, 'appendix'));
    expect(empty && outline(empty.doc).at(-1)).toBe('appendix:Appendix text');
    const plain = run(stateAt(doc(), 'One'), insertDocumentSection(TEMPLATE, null));
    expect(plain && outline(plain.doc)).toEqual(['cover:Cover', '-:One', '-:Two,Three']);
  });

  it('DOCE-SECTIONS-2.2 refuses a section the template does not let the writer add', () => {
    expect(run(stateAt(doc(), 'Two'), insertDocumentSection(TEMPLATE, 'cover'))).toBeNull();
    expect(run(stateAt(doc(), 'Two'), insertDocumentSection(TEMPLATE, 'unknown'))).toBeNull();
  });

  it('DOCE-SECTIONS-2.3 joins a section into the one before, keeping that one’s name', () => {
    const split = read(
      { name: null, content: [paragraph('One')] },
      { name: 'appendix', content: [paragraph('Two')] },
    );
    const next = run(stateAt(split, 'Two'), joinDocumentSectionBackward(TEMPLATE));
    expect(next && outline(next.doc)).toEqual(['-:One,Two']);
    expect(caretText(next)).toBe('Two');
    expect(run(stateAt(split, 'One'), joinDocumentSectionBackward(TEMPLATE))).toBeNull();
    const required = read(
      { name: null, content: [paragraph('One')] },
      { name: 'cover', content: [paragraph('Two')] },
    );
    expect(run(stateAt(required, 'Two'), joinDocumentSectionBackward(TEMPLATE))).toBeNull();
  });

  it('DOCE-SECTIONS-2.4 works on a section laid out on several pages', () => {
    const block = (value: string) =>
      documentSchema.node('paragraph', null, documentSchema.text(value));
    const pageOf = (blocks: Node[]) =>
      documentSchema.node('page', null, [
        documentSchema.node('page_header'),
        documentSchema.node('page_content', null, blocks),
        documentSchema.node('page_footnotes'),
        documentSchema.node('page_footer'),
      ]);
    const paged = documentSchema.node('doc', null, [
      documentSchema.node('page_section', null, [
        pageOf([block('One'), block('Two')]),
        pageOf([block('Three')]),
      ]),
    ]);
    const next = run(stateAt(paged, 'One'), insertDocumentSection(TEMPLATE, 'appendix'));
    expect(next && outline(next.doc)).toEqual(['-:One', 'appendix:Two,Three']);
  });
});
