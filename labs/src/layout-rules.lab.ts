// Shows the layout rules on fixed-height pages: headings that keep with the block they head, by
// that block's own split, over short paragraphs and captioned tables; a script block's output and a
// layout section's columns split across pages; and a host's own node type, a numbered log, that
// brings its own measure, split and fragment rule.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor';
import type { Node, NodeSpec } from 'prosemirror-model';
import { EditorState, type Transaction } from 'prosemirror-state';
import { Transform } from 'prosemirror-transform';
import { EditorView } from 'prosemirror-view';
import {
  createDocumentSchema,
  type DocumentFile,
  FRAGMENT_RULES,
  type FragmentRules,
  joinDocumentPages,
  LAYOUT_RULES,
  type LayoutBlock,
  type LayoutRules,
  type MeasureInput,
  readDocumentFile,
  sameStructure,
  type SplitBlock,
  type StoredNode,
} from '../../src/model/index.js';
import { createPagination, isPaginationTransaction } from '../../src/pagination/index.js';

const SENTENCES = [
  'The survey covered every room on the ground floor and two on the first.',
  'Each reading was taken twice, an hour apart, and the second reading was kept.',
  'Where the two readings differed by more than a tenth, a third was taken.',
  'The notes below list the rooms in the order they were visited.',
];

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const sentences = (count: number, from = 0) =>
  Array.from({ length: count }, (_, index) => SENTENCES[(from + index) % SENTENCES.length]).join(
    ' ',
  );
const paragraph = (id: string, count: number, from = 0): StoredNode => ({
  type: 'paragraph',
  attrs: { id },
  content: [text(sentences(count, from))],
});
const heading = (id: string, value: string): StoredNode => ({
  type: 'heading',
  attrs: { id, level: 2 },
  content: [text(value)],
});
const row = (cell: 'tableCell' | 'tableHeader', values: string[]): StoredNode => ({
  type: 'tableRow',
  content: values.map((value) => ({
    type: cell,
    content: [{ type: 'paragraph', content: [text(value)] }],
  })),
});
const table = (id: string, rows: number): StoredNode => ({
  type: 'table',
  attrs: { id, caption: `Readings, part ${id}`, captionEnabled: true },
  content: [
    row('tableHeader', ['Room', 'Reading']),
    ...Array.from({ length: rows }, (_, index) =>
      row('tableCell', [`Room ${String(index + 1)}`, String(index * 3)]),
    ),
  ],
});
const column = (id: string, count: number, from: number): StoredNode => ({
  type: 'column',
  attrs: { id },
  content: Array.from({ length: count }, (_, index) =>
    paragraph(`${id}p${String(index)}`, 1, from + index),
  ),
});

// Headings over short paragraphs that cannot split, and over captioned tables, after fillers of
// varied length, so some fall at a page's foot.
const keepCases: StoredNode[] = [
  ...Array.from({ length: 20 }, (_, index) => {
    const id = String(index + 1);
    return [
      paragraph(`f${id}`, (index % 7) + 1, index),
      heading(`h${id}`, `Finding ${id}`),
      paragraph(`s${id}`, 2, index + 1),
    ];
  }),
  ...Array.from({ length: 4 }, (_, index) => {
    const id = String(index + 1);
    return [
      paragraph(`g${id}`, index + 2, index + 2),
      heading(`ht${id}`, `Table ${id}`),
      table(id, 4),
    ];
  }),
].flat();

/** The id of the paragraph the host's log takes the place of. */
const LOG_SLOT = 'log-slot';
const LOG_ENTRIES = Array.from(
  { length: 30 },
  (_, index) => `Reading ${String(index + 1)} logged at ${String(8 + (index % 10))}:00.`,
);

const SAMPLE: DocumentFile = {
  formatVersion: 1,
  sections: [
    {
      name: null,
      content: [
        { type: 'heading', attrs: { id: 'title', level: 1 }, content: [text('Layout rules')] },
        ...keepCases,
        heading('hs', 'Script output'),
        {
          type: 'script',
          attrs: { id: 'script', source: 'report()' },
          content: Array.from({ length: 10 }, (_, index) =>
            paragraph(`sp${String(index)}`, 2, index),
          ),
        },
        heading('hc', 'Columns'),
        {
          type: 'columns',
          attrs: { id: 'columns', preset: 'halves' },
          content: [column('c1', 9, 0), column('c2', 6, 2)],
        },
        heading('hl', 'Log'),
        paragraph(LOG_SLOT, 1),
      ],
    },
  ],
};

// The host's node type: a numbered log whose entries are an attribute, so the editor's own
// measuring does not know where they sit.
const LOG_NODE = 'lab_log';

const logSpec: NodeSpec = {
  group: 'block',
  atom: true,
  attrs: { entries: { default: [] }, first: { default: 1 } },
  toDOM: (node) => [
    'div',
    { class: 'lab-log' },
    [
      'ol',
      { start: String(node.attrs.first) },
      ...(node.attrs.entries as string[]).map((entry) => ['li', entry]),
    ],
  ],
};

const logExtension: RichTextExtension = {
  name: 'lab-log',
  nodes: [{ name: LOG_NODE, spec: logSpec, order: 145 }],
};

interface LogMeasurement {
  /** Where each entry sits from the log's top. */
  readonly rows: readonly { top: number; bottom: number }[];
}

function measureLog({ element, scale }: MeasureInput): LogMeasurement {
  const top = element.getBoundingClientRect().top;
  const rows = [...element.querySelectorAll('li')].map((entry) => {
    const rect = entry.getBoundingClientRect();
    return { top: (rect.top - top) / scale, bottom: (rect.bottom - top) / scale };
  });
  return { rows };
}

// Splits the log after its last entry that fits, keeping two entries on each side.
function splitLog(block: LayoutBlock, fitting: number): SplitBlock | null {
  const { rows } = block.measurement as LogMeasurement;
  const entries = block.node.attrs.entries as string[];
  if (rows.length !== entries.length) return null;
  const foot = Math.max(0, block.height - (rows.at(-1)?.bottom ?? 0));
  const count = rows.filter((entry) => entry.bottom + foot <= fitting).length;
  const at = Math.min(count, entries.length - 2);
  const next = rows[at];
  if (at < 2 || !next) return null;
  const { node } = block;
  const part = Number(node.attrs.splitPartIndex ?? 0);
  const create = (attrs: Record<string, unknown>) =>
    node.type.create({ ...node.attrs, ...attrs }, null, node.marks);
  return {
    head: {
      ...block,
      node: create({ entries: entries.slice(0, at), splitPartIndex: part }),
      height: (rows[at - 1]?.bottom ?? 0) + foot,
      measurement: { rows: rows.slice(0, at) },
    },
    tail: [
      {
        ...block,
        node: create({
          entries: entries.slice(at),
          first: Number(node.attrs.first) + at,
          splitPartIndex: part + 1,
        }),
        height: block.height - next.top,
        breakBefore: true,
        measurement: {
          rows: rows.slice(at).map((entry) => ({
            top: entry.top - next.top,
            bottom: entry.bottom - next.top,
          })),
        },
      },
    ],
  };
}

// Joins the log that starts at `pos` into the one before: its entries follow on.
function joinLogs(tr: Transform, pos: number) {
  const { nodeBefore: previous, nodeAfter: next } = tr.doc.resolve(pos);
  if (!previous || !next) return;
  const entries = [...(previous.attrs.entries as string[]), ...(next.attrs.entries as string[])];
  tr.delete(pos, pos + next.nodeSize);
  tr.setNodeAttribute(pos - previous.nodeSize, 'entries', entries);
}

const RULES: LayoutRules = {
  ...LAYOUT_RULES,
  [LOG_NODE]: { keepsWithHeading: true, measure: measureLog, split: splitLog },
};
const FRAGMENTS: FragmentRules = {
  ...FRAGMENT_RULES,
  [LOG_NODE]: { whole: { splitPartIndex: null }, join: joinLogs },
};

// The sample with the host's log in its slot.
function sampleDocument(): Node {
  const schema = createDocumentSchema({ extensions: [logExtension] });
  const doc = readDocumentFile(SAMPLE, schema);
  let slot = -1;
  doc.descendants((node, pos) => {
    if (node.attrs.dataId === LOG_SLOT) slot = pos;
    return slot < 0;
  });
  const log = schema.nodes[LOG_NODE]?.create({ entries: LOG_ENTRIES });
  const placed = doc.nodeAt(slot);
  if (!log || !placed) return doc;
  return new Transform(doc).replaceWith(slot, slot + placed.nodeSize, log).doc;
}

// Every page's content, whatever its page and footnote numbers.
function contents(doc: Node): Node[] {
  const found: Node[] = [];
  doc.descendants((node) => {
    if (node.type.name === 'page_content') found.push(node);
    return !node.isBlock || ['doc', 'page_section', 'page'].includes(node.type.name);
  });
  return found;
}

function sameContent(left: Node, right: Node): boolean {
  const others = contents(right);
  return contents(left).every((content, index) => {
    const other = others[index];
    return Boolean(other && sameStructure(content, other));
  });
}

// Records what a test reads after the editor moved onto new pages.
function reportPages(tr: Transaction): void {
  const { dataset } = document.documentElement;
  const before = joinDocumentPages(tr.before, FRAGMENTS).doc;
  dataset.labJoinsWhole = String(sameContent(joinDocumentPages(tr.doc, FRAGMENTS).doc, before));
  dataset.labReady = 'true';
}

function render(): void {
  const measureIn = document.querySelector<HTMLElement>('.lab-measure');
  const pagesRoot = document.querySelector('.lab-pages');
  if (!measureIn || !pagesRoot) return;
  const pageHeight = Number.parseFloat(getComputedStyle(measureIn).getPropertyValue('--lab-page'));
  const pagination = createPagination({
    measureIn,
    pageHeight,
    rules: RULES,
    fragmentRules: FRAGMENTS,
  });
  const editor: EditorView = new EditorView(pagesRoot, {
    state: EditorState.create({ doc: sampleDocument(), plugins: [pagination.plugin] }),
    dispatchTransaction(tr: Transaction) {
      editor.updateState(editor.state.apply(tr));
      if (isPaginationTransaction(tr)) reportPages(tr);
    },
  });
}

render();
