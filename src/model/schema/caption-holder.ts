// The thin node that holds a captioned object whose own content cannot take its caption: a table,
// which holds only rows, or a code block, which holds only its code. Its attributes are the part
// of a split object the pages mark and any its kind adds, such as a table's suggestion of the
// whole; the object keeps its id and settings, and the stored format stores the object alone, with
// its caption first.

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
  /** Text attributes of its kind, on its element, null when unset. */
  readonly attributes?: readonly IdentityAttribute[];
}

/** The spec of a node holding a captioned object after its caption. */
export function captionHolder(options: CaptionHolderOptions): NodeSpec {
  const { className, content, alone, attributes = [] } = options;
  const read = (dom: HTMLElement) => ({
    splitPartIndex: readPart(dom),
    ...Object.fromEntries(
      attributes.map(({ name, dom: attr }) => [name, dom.getAttribute(attr) || null]),
    ),
  });
  const write = (attrs: Readonly<Record<string, unknown>>) => {
    const written: Record<string, string> = {};
    const part = attrs.splitPartIndex;
    if (Number.isInteger(part)) written[SPLIT_PART_INDEX_ATTR] = String(part);
    for (const { name, dom } of attributes) {
      const value = attrs[name];
      if (typeof value === 'string' && value) written[dom] = value;
    }
    return written;
  };
  return {
    group: 'block',
    content,
    defining: true,
    isolating: true,
    // Not an element of its own: it takes no element id, and the stored format stores the object.
    // The pages split it with its object, each part numbered as its object's part is.
    unstored: true,
    attrs: {
      splitPartIndex: { default: null },
      ...Object.fromEntries(attributes.map(({ name }) => [name, { default: null }])),
    },
    identityAttributes: [SPLIT_PART, ...attributes],
    parseDOM: [
      { tag: `div.${className}`, getAttrs: (dom) => read(dom) },
      {
        tag: alone.tag,
        priority: 60,
        getAttrs: (dom) => (dom.parentElement?.classList.contains(className) ? false : null),
        getContent: (dom, schema) => alone.content(dom as HTMLElement, schema),
      },
    ],
    toDOM: (node) => ['div', { class: className, ...write(node.attrs) }, 0],
  };
}
