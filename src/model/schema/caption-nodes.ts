// Captions as document content: a figure's caption, its only child, and a table's caption, which a
// thin `table_figure` holds before the table, since a table holds only rows. A caption holds text
// with its marks, footnote markers and the other inline content of a paragraph. The template's label
// and number lead it, and a later part of a split table shows its continued suffix after it.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor/kit';
import { DOMParser, Fragment, type NodeSpec, type Schema } from 'prosemirror-model';
import { normalizeCaptionText } from './caption-text.js';
import { SPLIT_PART_INDEX_ATTR, TABLE_CAPTION_TEXT_ATTR } from './dom-attributes.js';
import type { IdentityAttribute } from './element-attributes.js';
import { DOCUMENT_NODE_ORDER } from './node-order.js';
import { tableContentElement } from './table-nodes.js';

type OutputSpec = ReturnType<NonNullable<NodeSpec['toDOM']>>;
type CaptionKind = 'figure' | 'table';

const TEXT = { class: 'doc-caption-text', 'data-doc-caption-text': 'true' };
const CONTINUED_TEXT_ATTR = 'data-continued-text';

// What only the pages draw: read back from them, so the view finds the pages' markup unchanged,
// and cleared on a copy, so a pasted caption or table is whole.
const CONTINUED_TEXT: IdentityAttribute = {
  name: 'continuedText',
  dom: CONTINUED_TEXT_ATTR,
  onCopy: 'clear',
};
const SPLIT_PART: IdentityAttribute = {
  name: 'splitPartIndex',
  dom: SPLIT_PART_INDEX_ATTR,
  onCopy: 'clear',
};

// The part of a split table a holder is, as the pages mark it.
function readPart(dom: HTMLElement): number | null {
  const index = Number.parseInt(dom.getAttribute(SPLIT_PART_INDEX_ATTR) ?? '', 10);
  return Number.isInteger(index) && index >= 0 ? index : null;
}
const CONTINUED = { class: 'doc-caption-continued', 'data-doc-caption-continued': 'true' };

// A caption line: the label and number the stylesheet sets, the caption's content, and the
// continued suffix. The caption a later part of a split table repeats is empty, and shows the
// caption's text as `continuedText`; it is not edited, and only the pages show it.
function captionSpec(kind: CaptionKind, tag: string): NodeSpec {
  const line = {
    class: `doc-caption-line doc-${kind}-caption-line`,
    'data-caption-kind': kind,
  };
  return {
    content: 'inline*',
    defining: true,
    isolating: true,
    selectable: false,
    attrs: kind === 'table' ? { continuedText: { default: null } } : {},
    ...(kind === 'table' ? { identityAttributes: [CONTINUED_TEXT] } : {}),
    parseDOM: [
      {
        tag: kind === 'figure' ? 'figcaption' : `${tag}[data-caption-kind="${kind}"]`,
        getAttrs: (dom) => {
          if (kind !== 'table') return null;
          const text = dom.querySelector(`:scope > [${CONTINUED_TEXT_ATTR}]`);
          return { continuedText: text?.getAttribute(CONTINUED_TEXT_ATTR) ?? null };
        },
        contentElement: (dom) => dom.querySelector(':scope > [data-doc-caption-text]') ?? dom,
      },
    ],
    toDOM: (node) => {
      const continued: unknown = node.attrs.continuedText;
      if (typeof continued !== 'string') {
        return [tag, line, ['span', TEXT, 0], ['span', CONTINUED, '']] as unknown as OutputSpec;
      }
      const text = { ...TEXT, [CONTINUED_TEXT_ATTR]: continued };
      const repeated = { ...line, contenteditable: 'false' };
      return [tag, repeated, ['span', text, 0], ['span', CONTINUED, '']] as unknown as OutputSpec;
    },
  };
}

/** A figure's caption: its only child. */
const figureCaption: NodeSpec = captionSpec('figure', 'figcaption');

/** A table's caption, before the table in its `table_figure`. */
const tableCaption: NodeSpec = captionSpec('table', 'div');

/**
 * A table with its caption. It has no attributes of its own: the table keeps its id, layout and
 * caption settings, and the stored format stores the table alone, with its caption.
 */
const tableFigure: NodeSpec = {
  group: 'block',
  content: 'table_caption table',
  defining: true,
  isolating: true,
  // Not an element of its own: it takes no element id, and the stored format stores the table.
  // The pages split it with its table, each part numbered as its table's part is.
  unstored: true,
  attrs: { splitPartIndex: { default: null } },
  identityAttributes: [SPLIT_PART],
  parseDOM: [
    { tag: 'div.doc-table-figure', getAttrs: (dom) => ({ splitPartIndex: readPart(dom) }) },
    // A table pasted alone, with its caption from its own caption element or attribute.
    {
      tag: 'table',
      priority: 60,
      getAttrs: (dom) => (dom.parentElement?.classList.contains('doc-table-figure') ? false : null),
      getContent: (dom, schema) => pastedTable(dom as HTMLElement, schema),
    },
  ],
  toDOM: (node) => {
    const part: unknown = node.attrs.splitPartIndex;
    const attrs = Number.isInteger(part) ? { 'data-split-part-index': String(part) } : {};
    return ['div', { class: 'doc-table-figure', ...attrs }, 0];
  },
};

// A table pasted alone, read as its caption and the table: the caption from the table's caption
// element, or the caption text an older copy wrote on the table.
function pastedTable(dom: HTMLElement, schema: Schema): Fragment {
  const { table, table_caption: caption } = schema.nodes;
  if (!table || !caption) return Fragment.empty;
  const parser = DOMParser.fromSchema(schema);
  const read = table.spec.parseDOM?.find((rule) => rule.tag === 'table')?.getAttrs?.(dom);
  const rows = parser.parse(tableContentElement(dom), { topNode: table.create(read || null) });
  const element = dom.querySelector(':scope > caption');
  const text = normalizeCaptionText(dom.getAttribute(TABLE_CAPTION_TEXT_ATTR) ?? '');
  const line = element
    ? parser.parse(element, { topNode: caption.create() })
    : caption.create(null, text ? schema.text(text) : null);
  return Fragment.from([line, rows]);
}

/** The caption nodes and the table's figure. */
export const captionNodesExtension: RichTextExtension = {
  name: 'caption-nodes',
  nodes: [
    { name: 'table_figure', spec: tableFigure, order: DOCUMENT_NODE_ORDER.table_figure },
    { name: 'table_caption', spec: tableCaption, order: DOCUMENT_NODE_ORDER.table_caption },
    { name: 'figure_caption', spec: figureCaption, order: DOCUMENT_NODE_ORDER.figure_caption },
  ],
};
