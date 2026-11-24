// The characters typeset math draws: the text of its token elements (identifiers, numbers,
// operators, text and strings), not its annotation, which holds the source. Math the host serves
// no face for takes a reserved box of one em per cluster (DOCE-PAGINATION-12.9).

const TOKENS = 'mi, mn, mo, mtext, ms';
const TOKEN_TAGS = new Set(['mi', 'mn', 'mo', 'mtext', 'ms']);

/** Typeset MathML as a tree, as the pages' layout keeps it. */
interface MathNode {
  readonly tag: string;
  readonly children: readonly (MathNode | string)[];
}

/** The text typeset MathML draws, its white space left out. */
export function mathDrawnText(element: Element): string {
  return [...element.querySelectorAll(TOKENS)]
    .map((token) => token.textContent ?? '')
    .join('')
    .replace(/\s+/gu, '');
}

// The text of a tree's token elements, in order.
function tokenText(node: MathNode, inToken: boolean): string {
  const within = inToken || TOKEN_TAGS.has(node.tag);
  return node.children
    .map((child) => (typeof child === 'string' ? (within ? child : '') : tokenText(child, within)))
    .join('');
}

/** `mathDrawnText` of typeset MathML kept as a tree. */
export function mathTreeText(tree: MathNode): string {
  return tokenText(tree, false).replace(/\s+/gu, '');
}

/** How many grapheme clusters `text` holds; at least one, so empty math keeps a box. */
export function clusterCount(text: string): number {
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter() : null;
  const count = segmenter ? [...segmenter.segment(text)].length : [...text].length;
  return Math.max(1, count);
}
