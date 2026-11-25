// What math was typeset as, kept as data by the math views that typeset it, so what draws the pages
// without a view, such as the read-only viewer or a print drawn from the pages' layout, draws the
// same MathML (DOCE-PAGINATION-13.2). Kept by source and kind, each views plugin keeps its own.

import type { Node as ProseMirrorNode } from 'prosemirror-model';

/** A MathML element as data: its tag, its attributes and its content. */
export interface MathTree {
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: readonly (MathTree | string)[];
}

/** What a math node was typeset as: its MathML, or why it does not typeset and what it shows. */
export type TypesetMath =
  | { readonly state: 'ready'; readonly math: MathTree }
  | { readonly state: 'invalid'; readonly text: string; readonly message: string };

/** The math a views plugin typeset, by node. */
export interface MathTypesets {
  /** Keeps what a node's source was typeset as. */
  keep(display: boolean, latex: string, typeset: TypesetMath): void;
  /** What a math node's source was typeset as, or null before it is. */
  of(node: ProseMirrorNode): TypesetMath | null;
  /** What a source was typeset as, or null before it is. */
  find(display: boolean, latex: string): TypesetMath | null;
}

// How many sources are kept: the latest typeset, as math is typed and edited.
const KEPT = 2000;

const keyOf = (display: boolean, latex: string) => `${display ? 'display' : 'inline'}\n${latex}`;

/** Whether a node is math. */
export const isMath = (node: ProseMirrorNode) =>
  node.type.name === 'math_inline' || node.type.name === 'math_display';

/** Keeps the math typeset, the latest sources at most. */
export function createMathTypesets(): MathTypesets {
  const kept = new Map<string, TypesetMath>();
  return {
    keep(display, latex, typeset) {
      const key = keyOf(display, latex);
      kept.delete(key);
      kept.set(key, typeset);
      while (kept.size > KEPT) {
        const oldest = kept.keys().next().value;
        if (oldest === undefined) break;
        kept.delete(oldest);
      }
    },
    of(node) {
      if (!isMath(node)) return null;
      return kept.get(keyOf(node.type.name === 'math_display', node.textContent)) ?? null;
    },
    find: (display, latex) => kept.get(keyOf(display, latex)) ?? null,
  };
}

/** A MathML element drawn by the typesetter, as data. */
export function mathTree(element: Element): MathTree {
  const attrs: Record<string, string> = {};
  for (const { name, value } of element.attributes) attrs[name] = value;
  const children: (MathTree | string)[] = [];
  for (const child of element.childNodes) {
    if (child.nodeType === 1) children.push(mathTree(child as Element));
    else if (child.nodeType === 3) children.push(child.textContent ?? '');
  }
  return { tag: element.localName, attrs, children };
}
