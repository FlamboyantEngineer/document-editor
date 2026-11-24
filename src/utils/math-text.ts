// The characters typeset math draws: the text of its token elements (identifiers, numbers,
// operators, text and strings), not its annotation, which holds the source. Math with no layout
// takes a reserved box of one em per cluster (DOCE-PAGINATION-12.9).

const TOKEN_TAGS = new Set(['mi', 'mn', 'mo', 'mtext', 'ms']);

/** Typeset MathML as a tree, as the pages' layout keeps it. */
interface MathNode {
  readonly tag: string;
  readonly children: readonly (MathNode | string)[];
}

// The text of a tree's token elements, in order.
function tokenText(node: MathNode, inToken: boolean): string {
  const within = inToken || TOKEN_TAGS.has(node.tag);
  return node.children
    .map((child) => (typeof child === 'string' ? (within ? child : '') : tokenText(child, within)))
    .join('');
}

/** The text typeset MathML kept as a tree draws, its white space left out. */
export function mathTreeText(tree: MathNode): string {
  return tokenText(tree, false).replace(/\s+/gu, '');
}

/** How many grapheme clusters `text` holds; at least one, so empty math keeps a box. */
export function clusterCount(text: string): number {
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter() : null;
  const count = segmenter ? [...segmenter.segment(text)].length : [...text].length;
  return Math.max(1, count);
}
