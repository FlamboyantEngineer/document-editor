// Code: a block of code typed in, with its caption and the line it starts at when pagination splits
// it, and a block that shows code from an address.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor/kit';
import type { Node as ProseMirrorNode, NodeSpec } from 'prosemirror-model';
import { nodes as basicNodes } from 'prosemirror-schema-basic';
import { deriveLinkedCodeBlockCaption, normalizeCaptionText } from './caption-text.js';
import {
  CODE_BLOCK_CONTINUED_ATTR,
  CODE_CAPTION_TEXT_ATTR,
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

function captionLine(kind: 'code' | 'linked-code', text: string) {
  const className = kind === 'code' ? 'doc-code-caption-line' : 'doc-linked-code-caption-line';
  return [
    'div',
    { class: `doc-caption-line ${className}`, 'data-caption-kind': kind },
    ['span', { class: 'doc-caption-text', 'data-doc-caption-text': 'true' }, text],
    ['span', { class: 'doc-caption-continued', 'data-doc-caption-continued': 'true' }, ''],
  ];
}

function readCodeBlockAttrs(dom: HTMLElement) {
  const captionText = dom.querySelector(
    ':scope > .doc-caption-line [data-doc-caption-text="true"]',
  )?.textContent;
  return {
    language: readLanguage(dom),
    captionEnabled: dom.getAttribute('data-caption-enabled') !== 'false',
    caption: normalizeCaptionText(dom.getAttribute(CODE_CAPTION_TEXT_ATTR) || captionText || ''),
    codeBlockContinued: dom.getAttribute(CODE_BLOCK_CONTINUED_ATTR) === 'true',
    codeLineStart: readLineStart(dom),
  };
}

function renderCodeBlock(node: ProseMirrorNode) {
  const { language, caption, captionEnabled, codeBlockContinued, codeLineStart } = node.attrs;
  const attrs: DomAttributes = {
    'data-code-language': String(language || 'plaintext'),
    [CODE_CAPTION_TEXT_ATTR]: normalizeCaptionText(caption || ''),
    spellcheck: 'false',
  };
  if (captionEnabled === false) attrs['data-caption-enabled'] = 'false';
  if (codeBlockContinued) attrs[CODE_BLOCK_CONTINUED_ATTR] = 'true';
  if (Number.isInteger(codeLineStart) && Number(codeLineStart) > 1) {
    attrs[CODE_LINE_START_ATTR] = String(codeLineStart);
  }
  const code = ['code', { spellcheck: 'false' }, 0];
  return ['pre', attrs, captionLine('code', normalizeCaptionText(caption || '')), code];
}

const codeBlock: NodeSpec = {
  ...basicNodes.code_block,
  attrs: {
    language: { default: 'plaintext' },
    caption: { default: '' },
    captionEnabled: { default: true },
    codeBlockContinued: { default: false },
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
  const caption = captionLine('linked-code', deriveLinkedCodeBlockCaption(node.attrs.url || ''));
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
      }),
    },
  ],
  toDOM: (node) => renderLinkedCodeBlock(node) as unknown as OutputSpec,
};

/** Code blocks and linked code blocks. */
export const codeNodesExtension: RichTextExtension = {
  name: 'code-nodes',
  nodes: [
    { name: 'code_block', spec: codeBlock, order: DOCUMENT_NODE_ORDER.code_block },
    {
      name: 'linked_code_block',
      spec: linkedCodeBlock,
      order: DOCUMENT_NODE_ORDER.linked_code_block,
    },
  ],
};
