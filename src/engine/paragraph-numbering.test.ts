import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
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
  return readDocumentFile({ formatVersion: 1, sections }, documentSchema);
}

const numbersOf = (doc: ReturnType<typeof documentOf>, template = TEMPLATE) =>
  numberedParagraphs(doc, template).map((entry) => entry.text);

describe('paragraph numbering', () => {
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

  it('DOCE-NUMBERING-6.2 counts across pages and split parts, restarting at headings and sections', () => {
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
    // A paragraph the pages split shows its number on its first part only.
    let firstPos = -1;
    doc.descendants((node, pos) => {
      if (firstPos < 0 && node.type.name === 'paragraph' && node.textContent === 'A')
        firstPos = pos;
      return firstPos < 0;
    });
    const continued = doc.resolve(firstPos).parent.type;
    expect(continued.name).toBe('page_content');
    const tr = EditorState.create({ doc }).tr.insert(
      firstPos + (doc.nodeAt(firstPos)?.nodeSize ?? 0),
      documentSchema.node('paragraph', { splitPartIndex: 1 }, documentSchema.text('A, continued')),
    );
    expect(numbersOf(tr.doc)).toEqual(['1.', '1.1.', '1.', '2.', '3.', '1.']);
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
