// Code: a block of code typed in, held after its caption by a `code_figure`, with the line it starts
// at when pagination splits it, and a block that shows code from an address, whose caption is
// derived from the address.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor/kit';
import {
  DOMParser,
  Fragment,
  type Node as ProseMirrorNode,
  type NodeSpec,
  type Schema,
} from 'prosemirror-model';
import { nodes as basicNodes } from 'prosemirror-schema-basic';
import { captionHolder } from './caption-holder.js';
import { deriveLinkedCodeBlockCaption, normalizeCaptionText } from './caption-text.js';
import {
  CODE_BLOCK_CONTINUED_ATTR,
  CODE_CAPTION_TEXT_ATTR,
  CODE_LINE_CONTINUED_ATTR,
  CODE_LINE_START_ATTR,
  type DomAttributes,
} from './dom-attributes.js';
import { DOCUMENT_NODE_ORDER } from './node-order.js';

type OutputSpec = ReturnType<NonNullable<NodeSpec['toDOM']>>;

function readLanguage(dom: HTMLElement): string {
  return dom.getAttribute('data-code-language') || dom.getAttribute('data-language') || 'plaintext';
}

/** The first line's number, which is 1 unless the block continues a split one. */
function readLineStart(dom: HTMLElement): number {
  const raw = dom.getAttribute(CODE_LINE_START_ATTR);
  const parsed = raw === null ? 1 : Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

// Linked code's caption line, derived from its address and not edited.
function linkedCaptionLine(text: string) {
  return [
    'div',
    { class: 'doc-caption-line doc-linked-code-caption-line', 'data-caption-kind': 'linked-code' },
    ['span', { class: 'doc-caption-text', 'data-doc-caption-text': 'true' }, text],
    ['span', { class: 'doc-caption-continued', 'data-doc-caption-continued': 'true' }, ''],
  ];
}

function readCodeBlockAttrs(dom: HTMLElement) {
  return {
    language: readLanguage(dom),
    captionEnabled: dom.getAttribute('data-caption-enabled') !== 'false',
    codeBlockContinued: dom.getAttribute(CODE_BLOCK_CONTINUED_ATTR) === 'true',
    codeLineContinued: dom.getAttribute(CODE_LINE_CONTINUED_ATTR) === 'true',
    codeLineStart: readLineStart(dom),
  };
}

function renderCodeBlock(node: ProseMirrorNode) {
  const { language, captionEnabled, codeBlockContinued, codeLineContinued, codeLineStart } =
    node.attrs;
  const attrs: DomAttributes = {
    'data-code-language': String(language || 'plaintext'),
    spellcheck: 'false',
  };
  if (captionEnabled === false) attrs['data-caption-enabled'] = 'false';
  if (codeBlockContinued) attrs[CODE_BLOCK_CONTINUED_ATTR] = 'true';
  if (codeLineContinued) attrs[CODE_LINE_CONTINUED_ATTR] = 'true';
  if (Number.isInteger(codeLineStart) && Number(codeLineStart) > 1) {
    attrs[CODE_LINE_START_ATTR] = String(codeLineStart);
  }
  return ['pre', attrs, ['code', { spellcheck: 'false' }, 0]];
}

// A code block sits in its `code_figure`, after its caption, so it is in no group of its own.
const { group: _group, ...basicCodeBlock } = basicNodes.code_block;

const codeBlock: NodeSpec = {
  ...basicCodeBlock,
  attrs: {
    language: { default: 'plaintext' },
    captionEnabled: { default: true },
    codeBlockContinued: { default: false },
    codeLineContinued: { default: false },
    codeLineStart: { default: 1 },
  },
  parseDOM: [
    {
      tag: 'pre',
      preserveWhitespace: 'full',
      contentElement: 'code',
      getAttrs: readCodeBlockAttrs,
    },
  ],
  toDOM: (node) => renderCodeBlock(node) as unknown as OutputSpec,
};

// A code block pasted alone, read as its caption and the code: the caption from the caption line an
// older copy drew in it, or from its caption attribute.
function pastedCode(dom: HTMLElement, schema: Schema): Fragment {
  const { code_block: code, code_caption: caption } = schema.nodes;
  if (!code || !caption) return Fragment.empty;
  const parser = DOMParser.fromSchema(schema);
  // The code block's own rule reads its attributes, with its element's identity.
  const rule = code.spec.parseDOM?.find((each) => each.tag === 'pre');
  const block = code.create(rule?.getAttrs?.(dom) || readCodeBlockAttrs(dom));
  const element = dom.querySelector(':scope > code') ?? dom;
  const text = parser.parse(element, { topNode: block, preserveWhitespace: 'full' });
  const line = dom.querySelector(':scope > .doc-caption-line [data-doc-caption-text]');
  const attribute = normalizeCaptionText(dom.getAttribute(CODE_CAPTION_TEXT_ATTR) ?? '');
  const shown = line
    ? parser.parse(line, { topNode: caption.create() })
    : caption.create(null, attribute ? schema.text(attribute) : null);
  return Fragment.from([shown, text]);
}

/** A code block with its caption. */
const codeFigure: NodeSpec = captionHolder({
  className: 'doc-code-figure',
  content: 'code_caption code_block',
  alone: { tag: 'pre', content: pastedCode },
});

function renderLinkedCodeBlock(node: ProseMirrorNode) {
  const language = String(node.attrs.language || 'plaintext');
  const attrs: DomAttributes = {
    'data-linked-code-block': 'true',
    'data-url': String(node.attrs.url || ''),
    'data-code-language': language,
    'data-start-line': String(node.attrs.startLine || 1),
    class: 'linked-code-block',
  };
  if (node.attrs.codeBlockContinued) attrs[CODE_BLOCK_CONTINUED_ATTR] = 'true';
  if (node.attrs.codeLineContinued) attrs[CODE_LINE_CONTINUED_ATTR] = 'true';
  const caption = linkedCaptionLine(deriveLinkedCodeBlockCaption(node.attrs.url || ''));
  const code = ['code', { spellcheck: 'false' }, String(node.attrs.code || '')];
  const pre = ['pre', { 'data-code-language': language, spellcheck: 'false' }, caption, code];
  return ['div', attrs, pre];
}

const linkedCodeBlock: NodeSpec = {
  group: 'block',
  atom: true,
  attrs: {
    url: { default: '' },
    language: { default: 'plaintext' },
    code: { default: '' },
    startLine: { default: 1 },
    codeBlockContinued: { default: false },
    codeLineContinued: { default: false },
  },
  parseDOM: [
    {
      tag: 'div[data-linked-code-block="true"]',
      getAttrs: (dom: HTMLElement) => ({
        url: dom.getAttribute('data-url') || '',
        language: readLanguage(dom),
        code: dom.querySelector('code')?.textContent || '',
        startLine: Number(dom.getAttribute('data-start-line') || 1),
        codeBlockContinued: dom.getAttribute(CODE_BLOCK_CONTINUED_ATTR) === 'true',
        codeLineContinued: dom.getAttribute(CODE_LINE_CONTINUED_ATTR) === 'true',
      }),
    },
  ],
  toDOM: (node) => renderLinkedCodeBlock(node) as unknown as OutputSpec,
};

/** Code blocks with their holders, and linked code blocks. */
export const codeNodesExtension: RichTextExtension = {
  name: 'code-nodes',
  nodes: [
    { name: 'code_figure', spec: codeFigure, order: DOCUMENT_NODE_ORDER.code_figure },
    { name: 'code_block', spec: codeBlock, order: DOCUMENT_NODE_ORDER.code_block },
    {
      name: 'linked_code_block',
      spec: linkedCodeBlock,
      order: DOCUMENT_NODE_ORDER.linked_code_block,
    },
  ],
};
