// Text blocks (paragraphs, headings, code, captions, footnote entries) as the text layout engine
// lays them out, with the margins the stylesheet gives them where they stand: none in a header or
// a footer, and a paragraph none in a list item or a table cell.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { TextMeasure, TextMeasurement } from '../../model/index.js';
import { type BlockContext, type BlockParent, type Laid, laid, notLaid } from './context.js';
import type { TextLines } from './types.js';

// Where the stylesheet zeroes a paragraph's margins (`li > p`, `td > p`).
const PARAGRAPH_FLUSH: ReadonlySet<BlockParent> = new Set(['list-item', 'cell', 'region']);

/**
 * A line table as the splitters' text measurement: the height and number of the lines that the
 * text between two offsets touches. What a block takes beyond its lines, such as a code block's
 * padding, the splitters read from its height.
 */
function textMeasurementOf(table: TextLines): TextMeasurement {
  const { lines } = table;
  const measure = (from: number, to: number): TextMeasure => {
    let height = 0;
    let count = 0;
    lines.forEach((line, index) => {
      const end = lines[index + 1]?.from ?? Number.POSITIVE_INFINITY;
      if (line.from < to && end > from) {
        height += line.height;
        count += 1;
      }
    });
    return { height, lines: count };
  };
  // The lines go with the measurement, so a paragraph splits exactly at a computed line start.
  return { offset: 0, measure, lines: table };
}

function flushMargins(node: ProseMirrorNode, parent: BlockParent): boolean {
  if (parent === 'region') return true;
  return node.type.name === 'paragraph' && PARAGRAPH_FLUSH.has(parent);
}

/** A text block's height, margins and lines at the context's width. */
export function layTextBlock(context: BlockContext, node: ProseMirrorNode): Laid {
  const { options, place, parent } = context;
  const scope = place.scope ?? null;
  const prefix = options.labelOf?.(node);
  const result = options.text.layoutText(node, {
    width: place.width,
    scope,
    ...(prefix ? { prefix } : {}),
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
    measurement: textMeasurementOf(table),
  });
}
