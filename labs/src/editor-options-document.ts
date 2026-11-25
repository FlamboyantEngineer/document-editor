// The editor options lab's documents and the host's parts they are read with: a sample whose
// sections end with a table and that holds a link with a tooltip, a mention and a figure stored by
// its asset; the same document with missing, invalid and repeated element ids, as a host's older
// store may hold it; the schema options of the host's presentation (`DocumentSchemaOptions`) with an
// identity attribute of its own, an element's review state; and the element lifecycle built on it
// (docs/recipes/element-lifecycle.md): a plugin stamping each new element as a draft, and a lock on
// approved elements.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin, type Transaction } from 'prosemirror-state';
import { ELEMENT_ID_PATTERN } from '../../src/engine/index.js';
import type {
  DocumentFile,
  DocumentSchemaOptions,
  IdentityAttribute,
  StoredNode,
} from '../../src/model/index.js';
import { heading, text } from './lab-document.js';

const SENTENCES = [
  'The survey covered every room on the ground floor and two on the first.',
  'Each reading was taken twice, an hour apart, and the second reading was kept.',
  'Where the two readings differed by more than a tenth, a third was taken.',
  'The notes below list the rooms in the order they were visited.',
];

const paragraph = (id: string | null, from: number, count = 2): StoredNode => ({
  type: 'paragraph',
  ...(id === null ? {} : { attrs: { id } }),
  content: [text(Array.from({ length: count }, (_, at) => SENTENCES[(from + at) % 4]).join(' '))],
});

const row = (cells: readonly string[], header = false): StoredNode => ({
  type: 'tableRow',
  content: cells.map((value) => ({
    type: header ? 'tableHeader' : 'tableCell',
    content: [{ type: 'paragraph', content: [text(value)] }],
  })),
});

// A table of readings with its caption, long enough to cross a page.
const readings = (id: string, rows: number): StoredNode => ({
  type: 'table',
  attrs: { id, captionEnabled: true },
  content: [
    { type: 'caption', content: [text('Readings by room')] },
    row(['Room', 'Reading'], true),
    ...Array.from({ length: rows }, (_, at) =>
      row([`Room ${String(at + 1)}`, `${String(20 + (at % 7))}.${String(at % 10)}`]),
    ),
  ],
});

// A figure stored by its asset and revision, previewed at the address the host gives.
const FIGURE: StoredNode = {
  type: 'figure',
  attrs: {
    id: 'a0f00010',
    assetId: 'floor-plan',
    assetRevision: 'r3',
    alt: 'Floor plan',
    width: 240,
  },
  content: [{ type: 'caption', content: [text('Floor plan of the ground floor')] }],
};

const LINKED: StoredNode = {
  type: 'paragraph',
  attrs: { id: 'a0f00004' },
  content: [
    text('Readings follow the '),
    {
      type: 'text',
      text: 'survey method',
      marks: [
        {
          type: 'link',
          attrs: { href: 'https://example.com/method', title: 'The method, revision 2' },
        },
      ],
    },
    text(', checked by '),
    { type: 'mention', attrs: { person: 'person-01', label: 'Alex Doe' } },
    text('.'),
  ],
};

/** The lab's sample: two sections, each ending with a table. */
export function sampleFile(): DocumentFile {
  return {
    formatVersion: 1,
    sections: [
      {
        name: null,
        content: [
          { ...heading(1, 'Survey of the ground floor'), attrs: { id: 'a0f00001', level: 1 } },
          paragraph('a0f00002', 0),
          paragraph('a0f00003', 1, 3),
          LINKED,
          FIGURE,
          paragraph('a0f00005', 2, 3),
          paragraph('a0f00006', 3, 3),
          readings('a0f00007', 16),
        ],
      },
      {
        name: 'appendix',
        content: [
          { ...heading(1, 'Readings by hour'), attrs: { id: 'a0f00008', level: 1 } },
          readings('a0f00009', 4),
        ],
      },
    ],
  };
}

/** The sample as an older store may hold it: ids missing, malformed and repeated. */
export function brokenIdsFile(): DocumentFile {
  return {
    formatVersion: 1,
    sections: [
      {
        name: null,
        content: [
          { ...heading(1, 'Survey with broken ids'), attrs: { level: 1 } },
          paragraph('a0f00002', 0),
          paragraph('a0f00002', 1),
          paragraph('not an id!', 2),
          paragraph(null, 3),
        ],
      },
    ],
  };
}

/** Each element's id in the document, and how many are missing or repeated. */
export function elementIdReport(doc: ProseMirrorNode): string {
  const seen = new Map<string, number>();
  let missing = 0;
  doc.descendants((node) => {
    if (!('dataId' in node.attrs) || !node.isBlock || node.type.name.startsWith('page')) return;
    const id = typeof node.attrs.dataId === 'string' ? node.attrs.dataId : '';
    if (!ELEMENT_ID_PATTERN.test(id)) missing += 1;
    else seen.set(id, (seen.get(id) ?? 0) + 1);
  });
  const repeated = [...seen.values()].filter((count) => count > 1).length;
  return missing || repeated
    ? `${String(missing)} missing or invalid, ${String(repeated)} repeated`
    : 'every element has its own id';
}

// ----- The host's presentation and its identity attribute -----

/** The review state a host keeps on each paragraph and heading; a copy is a new draft. */
export const REVIEW_STATE: IdentityAttribute = {
  name: 'reviewState',
  dom: 'data-review-state',
  scope: ['paragraph', 'heading'],
  onCopy: 'clear',
};

// The time the document shows its assets as of: null for now.
export const assetsTime: { asOf: string | null } = { asOf: null };

// A preview drawn for the asset and the time it shows, as the host's file service would serve it.
const preview = (asset: string, revision: string, asOf: string | null) => {
  const label = `${asset} ${revision}${asOf ? ` as of ${asOf}` : ''}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" fill="${asOf ? '#fde68a' : '#bae6fd'}"/><text x="12" y="64" font-size="14" font-family="sans-serif">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

/** The host's schema options: its tooltip attribute, mention class, placeholders and assets. */
export const HOST_SCHEMA: DocumentSchemaOptions = {
  tooltipAttribute: 'data-tip',
  mentionClass: 'lab-mention',
  headerPlaceholder: 'The header the template gives',
  footerPlaceholder: 'The footer the template gives',
  assetPreviewUrl: (asset, revision) => preview(asset, revision, assetsTime.asOf),
  assetsAsOf: () => assetsTime.asOf,
  identityAttributes: [REVIEW_STATE],
};

// ----- The element lifecycle -----

const hasReviewState = (node: ProseMirrorNode) => 'reviewState' in node.attrs;

/** Stamps each element without a review state as a draft, out of the undo history. */
export const stampDrafts = new Plugin({
  appendTransaction(transactions, _before, state) {
    if (!transactions.some((tr) => tr.docChanged)) return null;
    const tr = state.tr;
    state.doc.descendants((node, pos) => {
      if (hasReviewState(node) && !node.attrs.reviewState)
        tr.setNodeMarkup(pos, null, { ...node.attrs, reviewState: 'draft' });
    });
    return tr.docChanged ? tr.setMeta('addToHistory', false) : null;
  },
});

/** Whether a position is inside an approved element, which the writer may not change. */
export function isApproved(doc: ProseMirrorNode, pos: number): boolean {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1)
    if ($pos.node(depth).attrs.reviewState === 'approved') return true;
  return false;
}

/** The element at the caret that keeps a review state, and where it starts. */
export function reviewedAt(state: EditorState): { node: ProseMirrorNode; pos: number } | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (hasReviewState(node)) return { node, pos: $from.before(depth) };
  }
  return null;
}

/** The host moving the element at the caret to a review state, out of the undo history. */
export function setReviewState(state: EditorState, value: string): Transaction | null {
  const at = reviewedAt(state);
  if (!at) return null;
  return state.tr
    .setNodeMarkup(at.pos, null, { ...at.node.attrs, reviewState: value })
    .setMeta('addToHistory', false);
}
