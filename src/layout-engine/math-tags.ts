// A display equation's tag (`\tag{3}`), taken apart from the equation so each is laid out on its
// own: the tag sits at the line's end, and the equation is fitted into the line less the tag's
// width (DOCE-PAGINATION-12.10). KaTeX draws a tagged equation as a one-row table across the line,
// an empty half-width cell on each side of the equation and the tag in a last cell; MathML's own
// form is a labelled row, its label first.

import type { MathTree } from '../engine/math-typeset.js';

/** An equation and its tag, each a `<math>` element of its own; the tag null without one. */
interface TaggedMath {
  readonly math: MathTree;
  readonly tag: MathTree | null;
}

const elements = (tree: MathTree): MathTree[] =>
  tree.children.filter((child): child is MathTree => typeof child !== 'string');

// A `<math>` element holding a row of content, with the original's attributes.
const mathOf = (from: MathTree, content: readonly (MathTree | string)[]): MathTree => ({
  tag: 'math',
  attrs: from.attrs,
  children: [{ tag: 'mrow', attrs: {}, children: content }],
});

// The table a tagged equation is drawn as: the `<math>` content, inside its `<semantics>`.
function onlyTable(tree: MathTree): MathTree | null {
  let content = elements(tree);
  const semantics = content.length === 1 || content.length === 2 ? content[0] : undefined;
  if (semantics?.tag === 'semantics') content = elements(semantics).filter(isShown);
  const [table] = content;
  return content.length === 1 && table?.tag === 'mtable' ? table : null;
}

const isShown = (tree: MathTree) => tree.tag !== 'annotation' && tree.tag !== 'annotation-xml';

const isEmptyCell = (cell: MathTree | undefined) => cell?.tag === 'mtd' && !cell.children.length;

// KaTeX's row: an empty cell, the equation, an empty cell, the tag.
function katexTag(row: MathTree): { math: MathTree; tag: MathTree } | null {
  const cells = elements(row);
  const [left, math, right, tag] = cells;
  if (row.tag !== 'mtr' || cells.length !== 4 || !math || !tag) return null;
  if (!isEmptyCell(left) || !isEmptyCell(right) || math.tag !== 'mtd' || tag.tag !== 'mtd')
    return null;
  return { math, tag };
}

// MathML's labelled row: the label, then the equation's cell.
function labelledRow(row: MathTree): { math: MathTree; tag: MathTree } | null {
  const [tag, math, ...rest] = elements(row);
  if (row.tag !== 'mlabeledtr' || rest.length || !tag || !math) return null;
  return { math, tag };
}

/** A display equation's tag taken apart from it; the tree itself, without a tag, otherwise. */
export function splitTag(tree: MathTree): TaggedMath {
  const table = onlyTable(tree);
  const rows = table ? elements(table) : [];
  const row = rows.length === 1 ? rows[0] : undefined;
  const parts = row ? (katexTag(row) ?? labelledRow(row)) : null;
  if (!parts) return { math: tree, tag: null };
  const inline = { ...tree.attrs, display: 'inline' };
  return {
    math: mathOf(tree, parts.math.children),
    tag: mathOf({ ...tree, attrs: inline }, parts.tag.children),
  };
}
