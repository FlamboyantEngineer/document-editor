import type { Node } from 'prosemirror-model';
import { readDocumentFile } from '../../../../src/model/format/document-format-convert.js';
import type { DocumentFile, StoredNode } from '../../../../src/model/index.js';
import { createDocumentSchema } from '../../../../src/model/schema/document-schema.js';
import marks from '../../../../test/fixtures/documents/inline-marks.json' with { type: 'json' };
import writing from '../../../../test/fixtures/documents/line-breaks-and-writing-systems.json' with { type: 'json' };
import mixed from '../../../../test/fixtures/documents/long-mixed.json' with { type: 'json' };
import math from '../../../../test/fixtures/documents/math.json' with { type: 'json' };
import lists from '../../../../test/fixtures/documents/nested-lists.json' with { type: 'json' };
import { shortListsDocument, singleSectionDocument } from '../../stress/scale-documents.js';
import { paginationDocument } from '../../stress/stress-documents.js';

export function requireValue<T>(value: T | null | undefined, description: string): T {
  if (value === undefined || value === null) throw new Error(`Missing ${description}`);
  return value;
}

export const schema = createDocumentSchema();
const text = (id: string, value: string) => ({
  type: 'paragraph',
  attrs: { id },
  content: [{ type: 'text', text: value }],
});
const mixedBlocks = requireValue(mixed.sections[0], 'mixed fixture section').content.filter(
  (block) =>
    ['paragraph', 'heading'].includes(block.type) &&
    !('title' in (block.attrs ?? {})) &&
    block.content?.every((child) => child.type === 'text'),
);
const marksBlocks = requireValue(marks.sections[0], 'marks fixture section').content.filter(
  (block) =>
    !block.content.some((inline) =>
      inline.marks?.some((mark) => ['subscript', 'superscript'].includes(mark.type)),
    ),
);

const columnWidths = [120, 210];
const table = {
  type: 'table',
  attrs: { id: 'explicit-table', captionEnabled: false },
  content: [
    ['Station', 'Reading'],
    ['West ridge', 'Rainfall increased through the afternoon after the gusts died down.'],
    ['North beacon', 'Noisy reports were filtered.'],
  ].map((cells, row) => ({
    type: 'tableRow',
    attrs: { id: `row-${String(row)}` },
    content: cells.map((value, column) => ({
      type: row === 0 ? 'tableHeader' : 'tableCell',
      attrs: { id: `cell-${String(row)}-${String(column)}`, colwidth: [columnWidths[column]] },
      content: [text(`cell-text-${String(row)}-${String(column)}`, value)],
    })),
  })),
};

const sample = mixedBlocks.find((block) => block.type === 'paragraph')?.content?.[0];
if (!sample || !('text' in sample))
  throw new Error('The stored mixed fixture needs a text paragraph');

const examples = [
  ...marksBlocks,
  {
    type: 'paragraph',
    attrs: { id: 'mixed-wrap' },
    content: Array.from({ length: 8 }, () => [
      { type: 'text', text: 'Log the ' },
      { type: 'text', text: 'overnight readings', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' using ' },
      { type: 'text', text: 'sensor.read()', marks: [{ type: 'code' }, { type: 'italic' }] },
      { type: 'text', text: ' and ' },
      {
        type: 'text',
        text: 'the log',
        marks: [{ type: 'link', attrs: { href: 'https://example.com/' } }],
      },
      { type: 'text', text: '. ' },
    ]).flat(),
  },
  text('long-word', 'Supercalifragilisticexpialidocious'.repeat(8)),
  text('whitespace', '  The  space\tbetween\nwords collapses.  '.repeat(9)),
  ...requireValue(writing.sections[0], 'writing fixture section').content.slice(0, 1),
  text('cjk', '雨量は毎朝記録します。气象站。測量を続けています。'.repeat(12)),
  text('arabic', 'مرحبا بالعالم، هذه نشرة الطقس لليوم التالي. '.repeat(15)),
  text('emoji', '👩🏽‍🔬 Measure 🌦️ and 🌡️ with 🧑‍🚀. 🇨🇦 '.repeat(15)),
  ...requireValue(lists.sections[0], 'lists fixture section').content,
  {
    type: 'codeBlock',
    attrs: { id: 'code-lines', captionEnabled: false },
    content: [
      { type: 'text', text: 'for day in range(7):\n    print(day)\n\n    # spaced\tcolumns' },
    ],
  },
  {
    type: 'figure',
    attrs: {
      id: 'fixed-image',
      width: 160,
      height: 88,
      alt: 'Gauge marker',
      src: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="160" height="88"%3E%3Crect width="160" height="88" fill="%23e2e8f0"/%3E%3Ccircle cx="80" cy="44" r="25" fill="%23475569"/%3E%3C/svg%3E',
      captionEnabled: false,
    },
    content: [{ type: 'caption' }],
  },
  table,
  ...requireValue(math.sections[0], 'math fixture section').content.slice(1, 3),
  text('split-paragraph', (sample.text + ' ').repeat(32)),
];

// Keep the exact stress source blocks for long paragraphs, heading runs and empty paragraphs.
function mixedStressDocument(): DocumentFile {
  const source = requireValue(
    paginationDocument().sections[0],
    'pagination stress section',
  ).content;
  const firstCode = source.findIndex((node) => node.type === 'codeBlock');
  if (firstCode < 2) throw new Error('The pagination stress fixture needs its opening text');
  const headingAndText = source.slice(0, firstCode - 1);
  const emptyParagraphs = source.filter(
    (node) => node.type === 'paragraph' && !node.content?.length,
  );
  const mixed = Array.from({ length: 18 }, (_, copy) =>
    examples.map((node) => stressCopy(node, copy)),
  ).flat();
  return {
    formatVersion: 1,
    sections: [{ name: null, content: [...headingAndText, ...emptyParagraphs, ...mixed] }],
  };
}

// Give repeated fixtures distinct identities and vary their explicit object sizes.
function stressCopy(node: StoredNode, copy: number): StoredNode {
  const attrs = { ...node.attrs };
  if (typeof attrs.id === 'string') attrs.id = `mixed-${String(copy)}-${attrs.id}`;
  if (node.type === 'figure') {
    attrs.width = 120 + 12 * (copy % 8);
    attrs.height = 50 + 17 * (copy % 6);
  }
  if (Array.isArray(attrs.colwidth)) {
    attrs.colwidth = attrs.colwidth.map((width: unknown) => Number(width) + 5 * ((copy % 7) - 3));
  }
  const content = node.content?.map((child) => stressCopy(child, copy));
  if (node.type === 'codeBlock' && content?.[0]?.text) {
    content[0] = { ...content[0], text: (content[0].text + '\n').repeat(1 + (copy % 6)) };
  }
  return {
    ...node,
    ...(Object.keys(attrs).length ? { attrs } : {}),
    ...(content ? { content } : {}),
  };
}

const stressFixtures = {
  'stress-text': () => singleSectionDocument(4420),
  'stress-lists': () => shortListsDocument(560),
  'stress-mixed': mixedStressDocument,
  'stress-pagination': paginationDocument,
};

export type Workload =
  'examples' | 'short' | 'medium' | 'long' | 'unsupported' | keyof typeof stressFixtures;
export function fixture(name: Workload): DocumentFile {
  switch (name) {
    case 'stress-text':
    case 'stress-lists':
    case 'stress-mixed':
    case 'stress-pagination':
      return stressFixtures[name]();
    case 'examples':
      return { formatVersion: 1, sections: [{ name: null, content: examples }] };
    case 'unsupported':
      return {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [
              text('normal-text', 'Text before unsupported content.'),
              { type: 'rule', attrs: { id: 'unsupported-rule' } },
            ],
          },
        ],
      };
    case 'short':
    case 'medium':
    case 'long': {
      const counts = { short: 48, medium: 380, long: 4800 };
      const content = Array.from({ length: counts[name] }, (_, index) => {
        const block = requireValue(
          mixedBlocks[index % mixedBlocks.length],
          'workload fixture block',
        );
        return { ...block, attrs: { ...block.attrs, id: `workload-${String(index)}` } };
      });
      return { formatVersion: 1, sections: [{ name: null, content }] };
    }
  }
}

export function readFixture(file: ReturnType<typeof fixture>) {
  return readDocumentFile(file, schema).doc;
}

export function contentBlocks(doc: Node) {
  const blocks: Node[] = [];
  doc.forEach((section) =>
    section.forEach((page) =>
      page.forEach((region) => {
        if (region.type.name === 'page_content') region.forEach((node) => blocks.push(node));
      }),
    ),
  );
  return blocks;
}
