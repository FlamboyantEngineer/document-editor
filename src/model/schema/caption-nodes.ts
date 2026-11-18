// Captions as document content: a figure's caption, its only child, and a table's or a code block's
// caption, which a thin `table_figure` or `code_figure` holds before the table or code, since a
// table holds only rows and a code block only its code. A caption holds text with its marks,
// footnote markers and the other inline content of a paragraph. The template's label and number
// lead it, and a later part of a split table or code block shows its continued suffix after it.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor/kit';
import { DOMParser, Fragment, type NodeSpec, type Schema } from 'prosemirror-model';
import { captionHolder } from './caption-holder.js';
import { normalizeCaptionText } from './caption-text.js';
import { TABLE_CAPTION_TEXT_ATTR } from './dom-attributes.js';
import type { IdentityAttribute } from './element-attributes.js';
import { DOCUMENT_NODE_ORDER } from './node-order.js';
import { tableContentElement } from './table-nodes.js';

type OutputSpec = ReturnType<NonNullable<NodeSpec['toDOM']>>;
type CaptionKind = 'figure' | 'table' | 'code';

const TEXT = { class: 'doc-caption-text', 'data-doc-caption-text': 'true' };
const CONTINUED_TEXT_ATTR = 'data-continued-text';

// What only the pages draw: read back from them, so the view finds the pages' markup unchanged,
// and cleared on a copy, so a pasted caption or table is whole.
const CONTINUED_TEXT: IdentityAttribute = {
  name: 'continuedText',
  dom: CONTINUED_TEXT_ATTR,
  onCopy: 'clear',
};
const CONTINUED = { class: 'doc-caption-continued', 'data-doc-caption-continued': 'true' };

// A caption line: the label and number the stylesheet sets, the caption's content, and the
// continued suffix. The caption a later part of a split table repeats is empty, and shows the
// caption's text as `continuedText`; it is not edited, and only the pages show it.
function captionSpec(kind: CaptionKind, tag: string): NodeSpec {
  const line = {
    class: `doc-caption-line doc-${kind}-caption-line`,
    'data-caption-kind': kind,
  };
  const repeats = kind !== 'figure';
  return {
    content: 'inline*',
    defining: true,
    isolating: true,
    selectable: false,
    attrs: repeats ? { continuedText: { default: null } } : {},
    ...(repeats ? { identityAttributes: [CONTINUED_TEXT] } : {}),
    parseDOM: [
      {
        tag: kind === 'figure' ? 'figcaption' : `${tag}[data-caption-kind="${kind}"]`,
        getAttrs: (dom) => {
          if (!repeats) return null;
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

/** A code block's caption, before the code in its `code_figure`. */
const codeCaption: NodeSpec = captionSpec('code', 'div');

/**
 * A table with its caption. It has no attributes of its own: the table keeps its id, layout and
 * caption settings, and the stored format stores the table alone, with its caption.
 */
const tableFigure: NodeSpec = captionHolder({
  className: 'doc-table-figure',
  content: 'table_caption table',
  // A table pasted alone, with its caption from its own caption element or attribute.
  alone: { tag: 'table', content: pastedTable },
});

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

/** The caption nodes and the table's figure; the code block's is with the code nodes. */
export const captionNodesExtension: RichTextExtension = {
  name: 'caption-nodes',
  nodes: [
    { name: 'table_figure', spec: tableFigure, order: DOCUMENT_NODE_ORDER.table_figure },
    { name: 'table_caption', spec: tableCaption, order: DOCUMENT_NODE_ORDER.table_caption },
    { name: 'figure_caption', spec: figureCaption, order: DOCUMENT_NODE_ORDER.figure_caption },
    { name: 'code_caption', spec: codeCaption, order: DOCUMENT_NODE_ORDER.code_caption },
  ],
};
