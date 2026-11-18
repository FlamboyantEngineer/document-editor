// The thin node that holds a captioned object whose own content cannot take its caption: a table,
// which holds only rows, or a code block, which holds only its code. It has no attributes of its
// own but the part of a split object the pages mark; the object keeps its id and settings, and the
// stored format stores the object alone, with its caption first.

import type { Fragment, NodeSpec, Schema } from 'prosemirror-model';
import { SPLIT_PART_INDEX_ATTR } from './dom-attributes.js';
import type { IdentityAttribute } from './element-attributes.js';

// What only the pages draw, cleared on a copy, so a pasted object is whole.
const SPLIT_PART: IdentityAttribute = {
  name: 'splitPartIndex',
  dom: SPLIT_PART_INDEX_ATTR,
  onCopy: 'clear',
};

// The part of a split object a holder is, as the pages mark it.
function readPart(dom: HTMLElement): number | null {
  const index = Number.parseInt(dom.getAttribute(SPLIT_PART_INDEX_ATTR) ?? '', 10);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

/** A holder's class, content and how the object pasted alone, without its holder, is read. */
interface CaptionHolderOptions {
  readonly className: string;
  readonly content: string;
  readonly alone: {
    readonly tag: string;
    readonly content: (dom: HTMLElement, schema: Schema) => Fragment;
  };
}

/** The spec of a node holding a captioned object after its caption. */
export function captionHolder({ className, content, alone }: CaptionHolderOptions): NodeSpec {
  return {
    group: 'block',
    content,
    defining: true,
    isolating: true,
    // Not an element of its own: it takes no element id, and the stored format stores the object.
    // The pages split it with its object, each part numbered as its object's part is.
    unstored: true,
    attrs: { splitPartIndex: { default: null } },
    identityAttributes: [SPLIT_PART],
    parseDOM: [
      { tag: `div.${className}`, getAttrs: (dom) => ({ splitPartIndex: readPart(dom) }) },
      {
        tag: alone.tag,
        priority: 60,
        getAttrs: (dom) => (dom.parentElement?.classList.contains(className) ? false : null),
        getContent: (dom, schema) => alone.content(dom as HTMLElement, schema),
      },
    ],
    toDOM: (node) => {
      const part: unknown = node.attrs.splitPartIndex;
      const attrs = Number.isInteger(part) ? { 'data-split-part-index': String(part) } : {};
      return ['div', { class: className, ...attrs }, 0];
    },
  };
}
