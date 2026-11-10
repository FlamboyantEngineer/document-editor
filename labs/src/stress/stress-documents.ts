// The stress labs' documents, built from a seeded random sequence so every load is the same: a
// very long document of varied content, a document of many kinds of tables, and a document of the
// cases pagination finds hardest.

import type { DocumentFile, StoredNode } from '../../../src/model/index.js';

// A small seeded generator (mulberry32), so a document is the same on every load.
function random(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(values: readonly T[]): T => values[Math.floor(next() * values.length)] as T,
  };
}

type Random = ReturnType<typeof random>;

const WORDS = (
  'the system shall report each fault within one second of its detection and keep a record of ' +
  'every report in the log so that an operator can review the sequence of events after the fact ' +
  'while the controller monitors supply voltage temperature and pressure against their limits ' +
  'and switches to the backup channel when the primary channel stops answering'
).split(' ');

const text = (value: string, marks?: StoredNode['marks']): StoredNode => ({
  type: 'text',
  text: value,
  ...(marks ? { marks } : {}),
});

function sentence(rng: Random, words = rng.int(8, 22)): string {
  const chosen = Array.from({ length: words }, () => rng.pick(WORDS)).join(' ');
  return `${chosen.charAt(0).toUpperCase()}${chosen.slice(1)}.`;
}

const sentences = (rng: Random, count: number) =>
  Array.from({ length: count }, () => sentence(rng)).join(' ');

let footnotes = 0;

// A paragraph of plain sentences, some with a bold or italic run and, now and then, a footnote.
function paragraph(rng: Random, count = rng.int(1, 7), notes = true): StoredNode {
  const content: StoredNode[] = [text(sentences(rng, count))];
  if (rng.next() < 0.3) content.push(text(` ${sentence(rng, 4)}`, [{ type: 'bold' }]));
  if (rng.next() < 0.2) content.push(text(` ${sentence(rng, 5)}`, [{ type: 'italic' }]));
  if (notes && rng.next() < 0.12) {
    footnotes += 1;
    content.push({
      type: 'footnote',
      attrs: { id: `n${String(footnotes)}` },
      content: [text(sentence(rng, rng.int(6, 30)))],
    });
    content.push(text(` ${sentence(rng)}`));
  }
  return { type: 'paragraph', content };
}

const heading = (level: number, value: string): StoredNode => ({
  type: 'heading',
  attrs: { level },
  content: [text(value)],
});

function list(rng: Random, depth = 0, items = rng.int(2, 6)): StoredNode {
  return {
    type: rng.next() < 0.5 ? 'bulletList' : 'orderedList',
    content: Array.from({ length: items }, () => ({
      type: 'listItem',
      content: [
        { type: 'paragraph', content: [text(sentence(rng, rng.int(3, 16)))] },
        ...(depth < 2 && rng.next() < 0.25 ? [list(rng, depth + 1, rng.int(1, 3))] : []),
      ],
    })),
  };
}

const cell = (
  type: 'tableCell' | 'tableHeader',
  value: string,
  attrs?: Record<string, unknown>,
): StoredNode => ({
  type,
  ...(attrs ? { attrs } : {}),
  content: [{ type: 'paragraph', content: value ? [text(value)] : [] }],
});

const row = (cells: StoredNode[]): StoredNode => ({ type: 'tableRow', content: cells });

interface TableShape {
  readonly rows: number;
  readonly columns: number;
  readonly caption?: string;
  /** Words in a body cell, at most. */
  readonly words?: number;
  readonly widths?: readonly number[];
}

function table(rng: Random, shape: TableShape): StoredNode {
  const header = Array.from({ length: shape.columns }, (_, index) =>
    cell('tableHeader', `Column ${String(index + 1)}`, columnWidth(shape, index)),
  );
  const body = Array.from({ length: shape.rows }, (_, rowIndex) =>
    row(
      Array.from({ length: shape.columns }, (_, index) =>
        cell(
          'tableCell',
          index === 0
            ? `Row ${String(rowIndex + 1)}`
            : sentence(rng, rng.int(1, shape.words ?? 6)).replace(/\.$/, ''),
          columnWidth(shape, index),
        ),
      ),
    ),
  );
  return {
    type: 'table',
    ...(shape.caption ? { attrs: { caption: shape.caption } } : {}),
    content: [row(header), ...body],
  };
}

const columnWidth = (shape: TableShape, index: number) => {
  const width = shape.widths?.[index];
  return width ? { colwidth: [width] } : undefined;
};

const codeBlock = (lines: number): StoredNode => ({
  type: 'codeBlock',
  attrs: { language: 'text' },
  content: [
    text(
      Array.from(
        { length: lines },
        (_, index) => `reading[${String(index)}] = sample(${String(index * 7)}); // channel A`,
      ).join('\n'),
    ),
  ],
});

const quote = (rng: Random): StoredNode => ({
  type: 'blockquote',
  content: [paragraph(rng, rng.int(1, 3), false)],
});

const contents: StoredNode = { type: 'contents', attrs: { kind: 'toc', depth: 2 } };

const file = (content: StoredNode[]): DocumentFile => ({
  formatVersion: 1,
  sections: [{ name: null, content }],
});

// One chapter of a long document: headings at three levels and a varied mix of blocks.
function chapter(rng: Random, index: number): StoredNode[] {
  const blocks: StoredNode[] = [heading(1, `Chapter ${String(index + 1)}`), paragraph(rng)];
  for (let part = 0; part < rng.int(2, 4); part += 1) {
    blocks.push(heading(2, `Part ${String(index + 1)}.${String(part + 1)}`));
    for (let block = 0; block < rng.int(3, 8); block += 1) {
      const kind = rng.next();
      if (kind < 0.5) blocks.push(paragraph(rng));
      else if (kind < 0.65) blocks.push(list(rng));
      else if (kind < 0.75) {
        blocks.push(table(rng, { rows: rng.int(2, 8), columns: rng.int(2, 5) }));
      } else if (kind < 0.82) blocks.push(codeBlock(rng.int(3, 18)));
      else if (kind < 0.88) blocks.push(quote(rng));
      else if (kind < 0.94) {
        blocks.push(heading(3, `Detail ${String(index + 1)}.${String(part + 1)}`), paragraph(rng));
      } else blocks.push({ type: 'rule' });
    }
  }
  return blocks;
}

/** A very long document of varied content: `chapters` chapters after a table of contents. */
export function longDocument(chapters: number): DocumentFile {
  const rng = random(7);
  footnotes = 0;
  return file([
    contents,
    ...Array.from({ length: chapters }, (_, index) => chapter(rng, index)).flat(),
  ]);
}

/** A document of many tables: small and large, wide, tall, merged, sized and back to back. */
export function tablesDocument(copies: number): DocumentFile {
  const rng = random(11);
  footnotes = 0;
  const merged: StoredNode = {
    type: 'table',
    attrs: { caption: 'Merged cells' },
    content: [
      row([
        cell('tableHeader', 'Group', { rowspan: 2 }),
        cell('tableHeader', 'Readings', { colspan: 3 }),
      ]),
      row([cell('tableHeader', 'Low'), cell('tableHeader', 'Mid'), cell('tableHeader', 'High')]),
      ...Array.from({ length: 6 }, (_, index) =>
        row(
          index % 3 === 0
            ? [
                cell('tableCell', `Group ${String(index / 3 + 1)}`, { rowspan: 3 }),
                cell('tableCell', 'merged across', { colspan: 2 }),
                cell('tableCell', String(index)),
              ]
            : [
                cell('tableCell', String(index)),
                cell('tableCell', String(index * 2)),
                cell('tableCell', String(index * 3)),
              ],
        ),
      ),
    ],
  };
  const one = (copy: number): StoredNode[] => [
    heading(1, `Tables ${String(copy + 1)}`),
    paragraph(rng, 2, false),
    table(rng, { rows: 3, columns: 2, caption: 'A small table' }),
    table(rng, { rows: 6, columns: 9, caption: 'A wide table', words: 2 }),
    paragraph(rng, 1, false),
    table(rng, { rows: 70, columns: 4, caption: 'A tall table across pages' }),
    merged,
    table(rng, {
      rows: 5,
      columns: 3,
      caption: 'Sized columns',
      widths: [80, 260, 140],
    }),
    table(rng, { rows: 8, columns: 3, caption: 'Long cell text', words: 60 }),
    table(rng, { rows: 2, columns: 3, caption: 'Back to back, first' }),
    table(rng, { rows: 2, columns: 3, caption: 'Back to back, second' }),
    ...Array.from({ length: 12 }, (_, index) =>
      table(rng, { rows: rng.int(1, 4), columns: rng.int(2, 6), caption: `Run ${String(index)}` }),
    ),
  ];
  return file(Array.from({ length: copies }, (_, copy) => one(copy)).flat());
}

/** A document of the cases pagination finds hardest. */
export function paginationDocument(): DocumentFile {
  const rng = random(23);
  footnotes = 0;
  const note = (words: number): StoredNode => {
    footnotes += 1;
    return {
      type: 'footnote',
      attrs: { id: `n${String(footnotes)}` },
      content: [text(sentence(rng, words))],
    };
  };
  const heavyCell: StoredNode = {
    type: 'table',
    attrs: { caption: 'A row taller than a page' },
    content: [
      row([cell('tableHeader', 'Item'), cell('tableHeader', 'Description')]),
      row([cell('tableCell', 'Short'), cell('tableCell', sentence(rng))]),
      row([cell('tableCell', 'Long'), cell('tableCell', sentences(rng, 60))]),
      row([cell('tableCell', 'After'), cell('tableCell', sentence(rng))]),
    ],
  };
  return file([
    heading(1, 'A paragraph longer than a page'),
    { type: 'paragraph', content: [text(sentences(rng, 90))] },
    heading(1, 'Headings in a run'),
    heading(2, 'Second level'),
    heading(3, 'Third level'),
    heading(4, 'Fourth level'),
    paragraph(rng, 2, false),
    heading(1, 'A code block longer than a page'),
    codeBlock(140),
    heading(1, 'A list longer than a page'),
    list(rng, 0, 45),
    heading(1, 'Many footnotes on one page'),
    {
      type: 'paragraph',
      content: Array.from({ length: 10 }, () => [text(` ${sentence(rng, 6)}`), note(12)]).flat(),
    },
    {
      type: 'paragraph',
      content: [text(sentence(rng)), note(220), text(` ${sentence(rng)}`)],
    },
    heading(1, 'Page breaks'),
    paragraph(rng, 1, false),
    { type: 'pageBreak' },
    { type: 'pageBreak' },
    paragraph(rng, 1, false),
    heading(1, 'Empty paragraphs'),
    ...Array.from({ length: 30 }, () => ({ type: 'paragraph' }) as StoredNode),
    heading(1, 'A quote across pages'),
    {
      type: 'blockquote',
      content: Array.from({ length: 8 }, () => paragraph(rng, 6, false)),
    },
    heading(1, 'A table row taller than a page'),
    heavyCell,
    heading(1, 'Short blocks'),
    ...Array.from({ length: 60 }, (_, index) =>
      index % 5 === 0 ? heading(2, `Short ${String(index)}`) : paragraph(rng, 1, false),
    ),
    heading(1, 'The end'),
    paragraph(rng, 2, false),
  ]);
}
