// What math was typeset as, kept as data by the math views that typeset it, so what draws the pages
// without a view, such as the read-only viewer or a print drawn from the pages' layout, draws the
// same MathML (DOCE-PAGINATION-13.2).

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

/** Whether a node is math. */
export const isMath = (node: ProseMirrorNode) =>
  node.type.name === 'math_inline' || node.type.name === 'math_display';

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
