// Text blocks (paragraphs, headings, code, captions, footnote entries) as the text layout engine
// lays them out, with the margins the stylesheet gives them where they stand: none in a header or
// a footer, and a paragraph none in a list item or a table cell.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { lineTableMeasurement } from '../text-layout.js';
import { type BlockContext, type BlockParent, type Laid, laid, notLaid } from './context.js';

// Where the stylesheet zeroes a paragraph's margins (`li > p`, `td > p`).
const PARAGRAPH_FLUSH: ReadonlySet<BlockParent> = new Set(['list-item', 'cell', 'region']);

function flushMargins(node: ProseMirrorNode, parent: BlockParent): boolean {
  if (parent === 'region') return true;
  return node.type.name === 'paragraph' && PARAGRAPH_FLUSH.has(parent);
}

/** A text block's height, margins and lines at the context's width. */
export function layTextBlock(context: BlockContext, node: ProseMirrorNode): Laid {
  const { options, place, parent } = context;
  const scope = place.scope ?? null;
  const prefix = options.labelOf?.(node);
  const footnoteNumber =
    node.type.name === 'footnote_entry' ? options.footnoteOf?.(node) : undefined;
  const result = options.text.layoutText(node, {
    width: place.width,
    scope,
    ...(prefix ? { prefix } : {}),
    ...(footnoteNumber === undefined ? {} : { footnoteNumber }),
  });
  if (!result.ok) return notLaid(node, result.reason);
  const { table } = result;
  const margins = flushMargins(node, parent)
    ? { marginTop: 0, marginBottom: 0 }
    : options.text.typography(node, scope);
  return laid({
    node,
    height: table.height + table.overhead,
    marginTop: margins.marginTop,
    marginBottom: margins.marginBottom,
    measurement: lineTableMeasurement(table),
  });
}
