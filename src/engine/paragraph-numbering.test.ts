import type { Node } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { type DecorationSet, EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  BASE_TEMPLATE,
  parseNumberingStyle,
  readDocumentFile,
  type StoredNode,
  type TemplateFile,
} from '../model/index.js';
import { createParagraphNumbering, numberedParagraphs, paragraphNumberText } from './index.js';

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const paragraph = (value: string, level = 1): StoredNode => ({
  type: 'paragraph',
  attrs: { level },
  content: value ? [text(value)] : [],
});
const heading = (value: string, level = 1, title = false): StoredNode => ({
  type: 'heading',
  attrs: { level, title },
  content: [text(value)],
});

const numbering = (format: string, extra: object = {}) => ({
  paragraph: { numbering: { format, ...extra } },
});

const TEMPLATE: TemplateFile = {
  formatVersion: 1,
  id: 'numbered',
  styles: numbering('1.1.'),
  sections: [
    { name: 'body' },
    { name: 'appendix', restartNumbering: true },
    { name: 'plain', restartNumbering: false, styles: numbering('') },
  ],
};

function documentOf(...sections: { name: string | null; content: StoredNode[] }[]) {
  return readDocumentFile({ formatVersion: 1, sections }, documentSchema).doc;
}

const numbersOf = (doc: ReturnType<typeof documentOf>, template = TEMPLATE) =>
  numberedParagraphs(doc, template).map((entry) => entry.text);

describe('paragraph numbering', () => {
  it("DOCE-NUMBERING-6.1 gives a paragraph's later part on the pages its first part's text position and no number, counting nothing again", () => {
    const node = (name: string, attrs: Record<string, unknown> | null, content?: Node[]) => {
      const type = documentSchema.nodes[name];
      if (!type) throw new Error(name);
      return type.create(attrs, content);
    };
    const part = (value: string, attrs: Record<string, unknown>) =>
      node('paragraph', attrs, [documentSchema.text(value)]);
    const page = (blocks: Node[]) =>
      node('page', null, [
        node('page_header', null),
        node('page_content', null, blocks),
        node('page_footnotes', null, []),
        node('page_footer', null),
      ]);
    const pages = node('doc', null, [
      node('page_section', { sectionName: 'body' }, [
        page([part('one', { dataId: 'p1', splitPartIndex: 0 })]),
        page([part('more', { dataId: 'p1', splitPartIndex: 1 }), part('two', { dataId: 'p2' })]),
      ]),
    ]);
    const shown = numberedParagraphs(pages, TEMPLATE).map(({ text, style, continued }) => ({
      text,
      style,
      continued,
    }));
    expect(shown.map(({ text, continued }) => [text, continued])).toEqual([
      ['1.', undefined],
      ['1.', true],
      ['2.', undefined],
    ]);
    expect(shown[1]?.style).toBe(shown[0]?.style);
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        doc: pages,
        plugins: [createParagraphNumbering({ template: () => TEMPLATE })],
      }),
    });
    const [, later, after] = [...view.dom.querySelectorAll('p')];
    expect(later).toHaveAttribute('data-paragraph-number', '');
    expect(later).toHaveAttribute('data-paragraph-continued', 'true');
    expect(after).toHaveAttribute('data-paragraph-number', '2.');
    expect(after).not.toHaveAttribute('data-paragraph-continued');
    view.destroy();
  });

  it('DOCE-NUMBERING-6.1 numbers top-level paragraphs with text where the template numbers them', () => {
    const doc = documentOf(
      {
        name: 'body',
        content: [
          paragraph('One'),
          paragraph(' ​'),
          { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph('Item')] }] },
          paragraph('Two'),
        ],
      },
      { name: 'plain', content: [paragraph('Unnumbered')] },
    );
    expect(numbersOf(doc)).toEqual(['1.', '2.']);
    expect(numbersOf(doc, { formatVersion: 1, id: 'none' })).toEqual([]);
    // The base template keeps its paragraph format switched off.
    expect(numbersOf(doc, BASE_TEMPLATE)).toEqual([]);
  });

  it('DOCE-NUMBERING-6.1 shows the number and level on the paragraph in the view', () => {
    const doc = documentOf({ name: 'body', content: [paragraph('One'), paragraph('Deeper', 2)] });
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        doc,
        plugins: [createParagraphNumbering({ template: () => TEMPLATE })],
      }),
    });
    const [first, second] = [...view.dom.querySelectorAll('p')];
    expect(first).toHaveAttribute('data-paragraph-number', '1.');
    expect(first).toHaveAttribute('data-paragraph-level', '1');
    expect(second).toHaveAttribute('data-paragraph-number', '1.1.');
    expect(second?.getAttribute('style')).toContain('--doc-paragraph-indentation: 20pt');
    view.destroy();
  });

  it('DOCE-NUMBERING-6.2 counts across sections, restarting at headings and sections', () => {
    const doc = documentOf(
      {
        name: 'body',
        content: [
          heading('Title', 1, true),
          paragraph('Before'),
          paragraph('Sub', 2),
          heading('Scope'),
          paragraph('A'),
          paragraph('B'),
        ],
      },
      { name: 'body', content: [paragraph('C')] },
      { name: 'appendix', content: [paragraph('D')] },
    );
    expect(numbersOf(doc)).toEqual(['1.', '1.1.', '1.', '2.', '3.', '1.']);
  });

  it('DOCE-NUMBERING-6.5 numbers paragraphs under a numbered heading after its number', () => {
    const headed: TemplateFile = {
      formatVersion: 1,
      id: 'headed',
      styles: {
        heading1: { numbering: { format: '1.' } },
        heading2: { numbering: { format: '1.1.' } },
        heading3: { numbering: { format: 'A-1-1' } },
        paragraph: { numbering: { format: '1.1.1.1.' } },
      },
      sections: [{ name: 'body' }],
    };
    const doc = documentOf({
      name: 'body',
      content: [
        paragraph('Before'),
        heading('One'),
        heading('One two', 2),
        heading('One three', 2),
        paragraph('A'),
        paragraph('A sub', 2),
        paragraph('B'),
        heading('Unseparated', 3),
        paragraph('C'),
        { ...heading('Unnumbered', 2), attrs: { level: 2, numbered: false } },
        paragraph('D'),
      ],
    });
    expect(numbersOf(doc, headed)).toEqual([
      '1.',
      '1.2.1.',
      '1.2.1.1.',
      '1.2.2.',
      'A-2-1.1.',
      '1.',
    ]);
  });

  it('DOCE-NUMBERING-6.6 keeps the numbers while typing leaves each block earning one', () => {
    const doc = documentOf({ name: 'body', content: [paragraph('One'), paragraph('')] });
    const state = EditorState.create({
      doc,
      plugins: [createParagraphNumbering({ template: () => TEMPLATE })],
    });
    const plugin = state.plugins[0];
    const numbers = (current: EditorState) =>
      (plugin?.getState(current) as DecorationSet).find().map((each) => each.from);
    const at = (current: EditorState, value: string) => {
      let found = -1;
      current.doc.descendants((node, pos) => {
        if (found < 0 && node.type.name === 'paragraph' && node.textContent === value) found = pos;
      });
      return found + 1;
    };
    const typed = state.apply(state.tr.insertText('ne', at(state, 'One')));
    expect(plugin?.getState(typed)).not.toBe(plugin?.getState(state));
    expect(numbers(typed)).toEqual(numbers(state));
    // Typing into the empty paragraph earns it a number, so the paragraphs are numbered again.
    const filled = typed.apply(typed.tr.insertText('Two', at(typed, '')));
    expect(numberedParagraphs(filled.doc, TEMPLATE).map((entry) => entry.text)).toEqual([
      '1.',
      '2.',
    ]);
    expect(numbers(filled)).toHaveLength(2);
  });

  it('DOCE-NUMBERING-6.3 writes the number with its levels, separators and affixes', () => {
    expect(paragraphNumberText(parseNumberingStyle('1.a'), [2, 3])).toBe('2.c');
    expect(paragraphNumberText(parseNumberingStyle('I.'), [4, 2])).toBe('IV.II.');
    expect(paragraphNumberText(parseNumberingStyle('1.'), [3], { prefix: '§', suffix: ')' })).toBe(
      '§.3.)',
    );
    expect(paragraphNumberText(parseNumberingStyle('1'), [3], { prefix: 'No ' })).toBe('No 3');
  });
});
