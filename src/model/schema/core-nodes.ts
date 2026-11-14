// The document's core node types: the top node, paragraphs, headings, quotes, rules, text, breaks
// and lists, as the base ProseMirror schemas define them with the document's own attributes.

import type {
  RichTextExtension,
  RichTextExtensionNode,
} from '@flamboyantengineer/ui-components/rich-text-editor/kit';
import type { Node as ProseMirrorNode, NodeSpec } from 'prosemirror-model';
import { nodes as basicNodes } from 'prosemirror-schema-basic';
import { bulletList, listItem, orderedList } from 'prosemirror-schema-list';
import { CUSTOM_STYLE_NAME } from '../format/template-format-validate.js';
import { DOCUMENT_NODE_ORDER } from './node-order.js';

/** The groups block content and top-level layouts belong to. */
export const BLOCK_GROUP = 'block';

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6];

// A block's style is the name of a custom style (DOCE-TEMPLATES-7.1), read from and written as
// its class. Markup pasted from a page carries that page's classes, which the host's stylesheet
// could act on, to hide the block or lay it over the page, so a class is a style only when it is
// one name a custom style may have.
function styleName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  return CUSTOM_STYLE_NAME.test(name) ? name : '';
}

// The class a block in a style writes.
function styleClass(node: ProseMirrorNode): Record<string, string> {
  const name = styleName(node.attrs.className);
  return name ? { class: name } : {};
}

const paragraph: NodeSpec = {
  attrs: { className: { default: '' } },
  content: 'inline*',
  group: BLOCK_GROUP,
  parseDOM: [
    {
      tag: 'p',
      getAttrs: (dom: HTMLElement) => ({ className: styleName(dom.getAttribute('class')) }),
    },
  ],
  toDOM: (node: ProseMirrorNode) => ['p', styleClass(node), 0],
};

const heading: NodeSpec = {
  attrs: {
    level: { default: 1 },
    docTitle: { default: false },
    /** False for a heading that takes no number and moves no counter, though it stays structural. */
    numbered: { default: true },
    className: { default: '' },
  },
  content: 'inline*',
  group: BLOCK_GROUP,
  defining: true,
  parseDOM: HEADING_LEVELS.map((level) => ({
    tag: `h${String(level)}`,
    getAttrs: (dom: HTMLElement) => ({
      level,
      docTitle: dom.getAttribute('data-doc-title') === 'true',
      numbered: dom.getAttribute('data-numbered') !== 'false',
      className: styleName(dom.getAttribute('class')),
    }),
  })),
  toDOM(node: ProseMirrorNode) {
    const attrs: Record<string, string> = {
      ...(node.attrs.docTitle ? { 'data-doc-title': 'true' } : {}),
      ...(node.attrs.numbered === false ? { 'data-numbered': 'false' } : {}),
      ...styleClass(node),
    };
    // Clamped, so an out-of-range level never writes an invalid tag.
    const level = Math.min(6, Math.max(1, Number(node.attrs.level) || 1));
    return [`h${String(level)}`, attrs, 0];
  },
};

/** The class of a checklist item's box, which the writer clicks to tick or clear it. */
export const TASK_BOX_CLASS = 'de-task-box';

// `true` or `false` makes an item a checklist item, ticked or not; `null` leaves it a plain item.
function readChecked(dom: HTMLElement): boolean | null {
  const stated = dom.getAttribute('data-checked');
  if (stated === 'true' || stated === 'false') return stated === 'true';
  // A task list pasted from a page: the item's own leading checkbox.
  const box = dom.firstElementChild;
  if (box?.tagName === 'INPUT' && box.getAttribute('type') === 'checkbox')
    return box.hasAttribute('checked') || (box as HTMLInputElement).checked;
  return null;
}

// A list item; a checklist item leads with its box, which is not part of the text.
const listItemNode: NodeSpec = {
  ...listItem,
  attrs: { checked: { default: null, validate: 'boolean|null' } },
  content: 'paragraph block*',
  parseDOM: [
    {
      tag: 'li',
      getAttrs: (dom: HTMLElement) => ({ checked: readChecked(dom) }),
      contentElement: (dom: HTMLElement) =>
        dom.querySelector<HTMLElement>(':scope > .de-task-content') ?? dom,
    },
  ],
  toDOM(node: ProseMirrorNode) {
    const { checked } = node.attrs;
    if (typeof checked !== 'boolean') return ['li', 0];
    const state = String(checked);
    const box = [
      'span',
      { class: TASK_BOX_CLASS, contenteditable: 'false', 'aria-hidden': 'true' },
    ];
    return ['li', { 'data-checked': state }, box, ['div', { class: 'de-task-content' }, 0]];
  },
};

function placed(name: keyof typeof DOCUMENT_NODE_ORDER, spec: NodeSpec): RichTextExtensionNode {
  return { name, spec, order: DOCUMENT_NODE_ORDER[name] };
}

/** The top node, paragraphs, headings, quotes, rules, text, hard breaks and lists. */
export const coreNodesExtension: RichTextExtension = {
  name: 'core-nodes',
  nodes: [
    // Layout blocks sit at the top level only, so their group joins `block` here and nowhere else.
    placed('doc', { ...basicNodes.doc, content: '(page_section | block | layout)+' }),
    placed('paragraph', paragraph),
    placed('blockquote', basicNodes.blockquote),
    placed('horizontal_rule', basicNodes.horizontal_rule),
    placed('heading', heading),
    placed('text', basicNodes.text),
    placed('hard_break', basicNodes.hard_break),
    placed('ordered_list', { ...orderedList, content: 'list_item+', group: BLOCK_GROUP }),
    placed('bullet_list', { ...bulletList, content: 'list_item+', group: BLOCK_GROUP }),
    placed('list_item', listItemNode),
  ],
};
