// Blocks that arrange or list the document: a layout section that sets its columns from a preset,
// its columns, and a table of contents built from the document's headings or captions.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor';
import type { Node as ProseMirrorNode, NodeSpec } from 'prosemirror-model';
import type { DomAttributes } from './dom-attributes.js';
import { normalizeDocumentLayoutPresetId } from './layout-presets.js';
import { DOCUMENT_NODE_ORDER } from './node-order.js';

/** The node types of a layout section and its columns, and the group a layout belongs to. */
export const LAYOUT_SECTION_NODE = 'layout_section';
export const LAYOUT_COLUMN_NODE = 'layout_column';
export const LAYOUT_NODE_GROUP = 'layout';

// A layout sits only at the top level, in its own group that the document and page content admit,
// so layouts never nest or enter lists and tables.
const layoutSection: NodeSpec = {
  group: LAYOUT_NODE_GROUP,
  content: `${LAYOUT_COLUMN_NODE}+`,
  isolating: true,
  attrs: { preset: { default: normalizeDocumentLayoutPresetId(null) } },
  parseDOM: [
    {
      tag: 'div[data-layout-preset]',
      getAttrs: (dom: HTMLElement) => ({
        preset: normalizeDocumentLayoutPresetId(dom.getAttribute('data-layout-preset')),
      }),
    },
  ],
  toDOM: (node) => [
    'div',
    {
      class: 'doc-layout-section',
      'data-layout-preset': normalizeDocumentLayoutPresetId(node.attrs.preset),
    },
    0,
  ],
};

const layoutColumn: NodeSpec = {
  // `paragraph` first, so a new column gets an empty paragraph.
  content: '(paragraph | block)+',
  isolating: true,
  parseDOM: [{ tag: 'div[data-layout-column]' }],
  toDOM: () => ['div', { class: 'doc-layout-column', 'data-layout-column': '' }, 0],
};

function readTocAttrs(dom: HTMLElement) {
  return {
    tocType: dom.getAttribute('data-toc-type') || 'toc',
    minLevel: Number(dom.getAttribute('data-min-level') || 6),
    refFilter: dom.getAttribute('data-ref-filter') || null,
    entryStart: Number(dom.getAttribute('data-entry-start') || 0),
    entryEnd: dom.hasAttribute('data-entry-end')
      ? Number(dom.getAttribute('data-entry-end'))
      : null,
    showTitle: dom.getAttribute('data-show-title') !== 'false',
  };
}

function renderToc(node: ProseMirrorNode) {
  const { tocType, minLevel, refFilter, entryStart, entryEnd, showTitle } = node.attrs;
  const attrs: DomAttributes = {
    'data-toc-block': 'true',
    'data-toc-type': String(tocType || 'toc'),
    'data-min-level': String(minLevel || 6),
    'data-entry-start': String(Math.max(0, Number(entryStart) || 0)),
    'data-show-title': showTitle === false ? 'false' : 'true',
    class: 'toc-block',
  };
  if (refFilter) attrs['data-ref-filter'] = String(refFilter);
  if (Number.isInteger(entryEnd) && Number(entryEnd) >= 0) {
    attrs['data-entry-end'] = String(entryEnd);
  }
  return ['div', attrs] as ['div', DomAttributes];
}

// The entry range lets pagination split a long table of contents across pages.
const tocBlock: NodeSpec = {
  group: 'block',
  atom: true,
  attrs: {
    tocType: { default: 'toc' },
    minLevel: { default: 6 },
    refFilter: { default: null },
    entryStart: { default: 0 },
    entryEnd: { default: null },
    showTitle: { default: true },
  },
  parseDOM: [{ tag: 'div[data-toc-block="true"]', getAttrs: readTocAttrs }],
  toDOM: renderToc,
};

/** Layout sections, their columns, and tables of contents. */
export const blockLayoutNodesExtension: RichTextExtension = {
  name: 'block-layout-nodes',
  nodes: [
    { name: 'toc_block', spec: tocBlock, order: DOCUMENT_NODE_ORDER.toc_block },
    { name: 'layout_section', spec: layoutSection, order: DOCUMENT_NODE_ORDER.layout_section },
    { name: 'layout_column', spec: layoutColumn, order: DOCUMENT_NODE_ORDER.layout_column },
  ],
};
