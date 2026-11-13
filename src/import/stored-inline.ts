// Stored inline content as the format keeps it: each node's marks in the schema's mark order, and
// adjacent text with the same marks joined into one text node. Every reader builds inline content
// through these, so what it gives reads and writes back unchanged.

import {
  STORED_MARK_TYPES,
  type StoredMark,
  type StoredNode,
} from '../model/format/document-format.js';
import { DOCUMENT_MARK_ORDER } from '../model/schema/node-order.js';

// Each stored mark type's place in the schema's mark order.
const MARK_ORDER: ReadonlyMap<string, number> = new Map(
  Object.entries(STORED_MARK_TYPES).map(([name, mapping]) => [
    mapping.type,
    (DOCUMENT_MARK_ORDER as Readonly<Record<string, number>>)[name] ?? 0,
  ]),
);

const sameMark = (a: StoredMark, b: StoredMark) =>
  a.type === b.type && JSON.stringify(a.attrs ?? null) === JSON.stringify(b.attrs ?? null);

/**
 * Marks with one more, in the schema's order. A mark of a type that may overlap itself, such as a
 * comment, is added beside the others of its type; any other replaces the one of its type.
 */
export function withMark(marks: readonly StoredMark[], mark: StoredMark): StoredMark[] {
  const overlaps = mark.type === 'comment';
  const kept = marks.filter((each) => (overlaps ? !sameMark(each, mark) : each.type !== mark.type));
  return [...kept, mark].sort(
    (a, b) => (MARK_ORDER.get(a.type) ?? 0) - (MARK_ORDER.get(b.type) ?? 0),
  );
}

/** A text node, with its marks when it has any. */
export const textNode = (text: string, marks: readonly StoredMark[]): StoredNode =>
  marks.length ? { type: 'text', text, marks: [...marks] } : { type: 'text', text };

/** Inline content with adjacent text of the same marks joined and empty text left out. */
export function joinText(nodes: readonly StoredNode[]): StoredNode[] {
  const out: StoredNode[] = [];
  for (const node of nodes) {
    const last = out[out.length - 1];
    if (
      node.type === 'text' &&
      last?.type === 'text' &&
      JSON.stringify(last.marks) === JSON.stringify(node.marks)
    ) {
      out[out.length - 1] = { ...last, text: `${last.text ?? ''}${node.text ?? ''}` };
    } else if (node.type !== 'text' || node.text) out.push(node);
  }
  return out;
}
