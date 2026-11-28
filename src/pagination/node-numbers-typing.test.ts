import { Fragment, type Node as ProseMirrorNode } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { note, paragraph, text } from '../../test/footnote-fixtures.js';
import { readRegressionDocument, readRegressionTemplate } from '../../test/stored-fixtures.js';
import { readDocumentFile, type StoredNode, type TemplateFile } from '../model/index.js';
import { createDocumentSchema } from '../model/schema/document-schema.js';
import { BASE_TEMPLATE } from '../model/templates/base-template.js';
import { holdNodeNumbers, type NodeNumbers } from './node-numbers.js';

const schema = createDocumentSchema();

// The most children walked to number a document after one typed letter: the path from the
// document to the text block typed in, and no other block (DOCE-PAGINATION-11.14).
const WALKED_PER_LETTER = 16;

const REGRESSION = [
  'caption-numbering',
  'footnote-heavy',
  'footnotes-in-structures',
  'headings-all-levels',
  'math',
  'paragraph-levels-and-styles',
  'roman-numbering-coverage',
  'table-rich-cells',
  'figures',
  'linked-code',
];

// The text blocks of each regression document typed in, spread over it, so the suite stays fast.
const BLOCKS_TYPED_IN = 24;

// At most `count` of the values, spread evenly from the first to the last.
function spread<T>(values: readonly T[], count: number): T[] {
  if (values.length <= count) return [...values];
  const step = (values.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, index) => values[Math.round(index * step)] as T);
}

function documentOf(content: StoredNode[]): ProseMirrorNode {
  return readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, schema).doc;
}

// A long document: a heading every twelfth block and a footnote every twentieth.
function longDocument(blocks: number): ProseMirrorNode {
  const content: StoredNode[] = [];
  for (let index = 0; index < blocks; index += 1) {
    if (index % 12 === 0)
      content.push({
        type: 'heading',
        attrs: { level: 1 + (index % 3) },
        content: [text(`Heading ${String(index)}`)],
      });
    const words = text(`Paragraph ${String(index)} with some words in it`);
    content.push(
      paragraph(words, ...(index % 20 === 0 ? [note(`n${String(index)}`, 'A note')] : [])),
    );
  }
  return documentOf(content);
}

// A document with text typed at a position.
const typeAt = (doc: ProseMirrorNode, at: number, value: string) =>
  new Transform(doc).insert(at, schema.text(value)).doc;

// How many times numbering walks a fragment's children or finds a child by position.
function countWalks() {
  const counted = { walks: 0 };
  // `findIndex` is internal to ProseMirror's fragments, which `nodeAt` and `resolve` call.
  const proto = Fragment.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const name of ['nodesBetween', 'forEach', 'findIndex']) {
    const original = proto[name];
    if (!original) throw new Error(`Fragment has no ${name}`);
    vi.spyOn(proto, name).mockImplementation(function (this: Fragment, ...args: unknown[]) {
      counted.walks += 1;
      return original.apply(this, args);
    });
  }
  return counted;
}

// Every number a holder gives a document's nodes, in document order.
function numbersOf(numbers: NodeNumbers, doc: ProseMirrorNode): string[] {
  const found: string[] = [];
  doc.descendants((node) => {
    found.push(
      [
        node.type.name,
        numbers.keyOf(node),
        numbers.prefixOf(node) ?? '-',
        numbers.paragraphOf(node)?.label ?? '-',
        numbers.labelOf(node) ?? '-',
        numbers.footnoteOf(node) ?? '-',
        numbers.equationOf(node) ?? '-',
      ].join(' '),
    );
  });
  return found;
}

// The starts of a document's text blocks.
function textBlockStarts(doc: ProseMirrorNode): number[] {
  const starts: number[] = [];
  doc.descendants((node, pos) => {
    if (node.isTextblock) starts.push(pos + 1);
  });
  return starts;
}

// A holder numbers a document, then one edited from it, as fresh numbering of it does.
function expectNumberedAsFresh(
  before: ProseMirrorNode,
  after: ProseMirrorNode,
  template: TemplateFile,
) {
  const typed = holdNodeNumbers(template);
  typed.number(before);
  typed.number(after);
  const fresh = holdNodeNumbers(template);
  fresh.number(after);
  expect(typed.current().doc).toBe(after);
  expect(numbersOf(typed.current(), after)).toEqual(numbersOf(fresh.current(), after));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('holdNodeNumbers while typing', () => {
  it('DOCE-PAGINATION-11.14 walks only the typed block path to number a letter typed in a long document', () => {
    const doc = longDocument(4000);
    const numbers = holdNodeNumbers(BASE_TEMPLATE);
    numbers.number(doc);
    const at = textBlockStarts(doc)[2000] ?? 0;
    const typed = typeAt(doc, at + 3, 'x');
    const walked = countWalks();
    numbers.number(typed);
    expect(walked.walks).toBeLessThanOrEqual(WALKED_PER_LETTER);
    expect(numbers.current().doc).toBe(typed);
    vi.restoreAllMocks();
    const fresh = holdNodeNumbers(BASE_TEMPLATE);
    fresh.number(typed);
    expect(numbersOf(numbers.current(), typed)).toEqual(numbersOf(fresh.current(), typed));
  });

  it('DOCE-PAGINATION-11.14 numbers a document typed from a typed one as freshly, letter after letter', () => {
    const numbers = holdNodeNumbers(BASE_TEMPLATE);
    let doc = longDocument(300);
    numbers.number(doc);
    const starts = textBlockStarts(doc);
    for (const index of [5, 5, 80, 6, 250, 0]) {
      const at = (starts[index] ?? 1) + 2;
      doc = typeAt(doc, at, 'y');
      numbers.number(doc);
      doc = new Transform(doc).delete(at - 1, at).doc;
      numbers.number(doc);
    }
    const fresh = holdNodeNumbers(BASE_TEMPLATE);
    fresh.number(doc);
    expect(numbersOf(numbers.current(), doc)).toEqual(numbersOf(fresh.current(), doc));
  });

  it.each(REGRESSION)(
    'DOCE-PAGINATION-11.14 keeps the numbers of %s through text typed or deleted in each text block',
    (name) => {
      const file = readRegressionDocument(name);
      const template = readRegressionTemplate(file.template?.id ?? 'regression-base');
      const { doc } = readDocumentFile(file, schema);
      for (const at of spread(textBlockStarts(doc), BLOCKS_TYPED_IN)) {
        expectNumberedAsFresh(doc, typeAt(doc, at, 'x'), template);
        const block = doc.resolve(at).parent;
        if (block.firstChild?.isText && block.firstChild.nodeSize > 1)
          expectNumberedAsFresh(doc, new Transform(doc).delete(at, at + 1).doc, template);
      }
    },
  );

  it('DOCE-PAGINATION-11.14 numbers again a structural edit, a footnote marker typed or a paragraph that comes to hold text', () => {
    const doc = documentOf([
      { type: 'heading', attrs: { level: 1 }, content: [text('One')] },
      paragraph(text('First'), note('a', 'A note')),
      paragraph(),
      paragraph(text('Second'), note('b', 'B note')),
    ]);
    const [heading = 0, first = 0, empty = 0, second = 0] = textBlockStarts(doc);
    const marker = doc.resolve(second).parent.lastChild;
    if (!marker) throw new Error('no marker');
    const edits = [
      new Transform(doc).setNodeMarkup(heading - 1, undefined, { level: 2 }).doc,
      new Transform(doc).insert(first + 2, marker).doc,
      typeAt(doc, empty, 'Now with text'),
      new Transform(doc).delete(second + 6, second + 7).doc,
      new Transform(doc).split(first + 2).doc,
    ];
    for (const edited of edits) expectNumberedAsFresh(doc, edited, BASE_TEMPLATE);
    const numbers = holdNodeNumbers(BASE_TEMPLATE);
    numbers.number(doc);
    const version = numbers.version();
    numbers.number(new Transform(doc).insert(first + 2, marker).doc);
    expect(numbers.version()).toBe(version + 1);
  });
});
