// A document's blocks as Markdown: headings, paragraphs, lists, quotes, code, math, tables,
// figures, rules and template blocks. A block a suggestion leaves out, a page break and a list of
// contents are left out.

import { storedMathSource, type StoredNode } from '../document-format.js';
import { isLeftOut } from '../left-out.js';
import { assetAddress } from '../writer-values.js';
import { codeFence, escapeHeadingEnd, escapeLineStart, escapeText, linkAddress } from './escape.js';
import { inlines } from './inlines.js';
import { tableOf } from './tables.js';
import { text, type Writing } from './writing.js';

const inlineText = (content: readonly StoredNode[] | undefined) =>
  (content ?? []).map((node) => text(node.text)).join('');

// Prefixes every line of a block, the first with `first`, the others with `rest` and blank ones
// with `blank`: a quote's blank lines keep its marker, so that its blocks stay in it.
const prefixed = (
  block: string,
  [first, rest = ' '.repeat(first.length), blank = '']: readonly [string, string?, string?],
) =>
  block
    .split('\n')
    .map((line, index) => (line ? `${index === 0 ? first : rest}${line}` : blank))
    .join('\n');

// A caption below the block it captions, in italics.
const captioned = (block: string, caption: unknown) =>
  text(caption) ? `${block}\n\n*${escapeText(text(caption))}*` : block;

function listOf(node: StoredNode, writing: Writing): string {
  const ordered = node.type === 'orderedList';
  const start = typeof node.attrs?.start === 'number' ? node.attrs.start : 1;
  // An item whose blocks are all left out, as by a suggestion, is left out with its marker.
  return (node.content ?? [])
    .map((item) => blocks(item.content, writing).join('\n\n'))
    .filter((item) => item !== '')
    .map((item, index) => prefixed(item, [ordered ? `${String(start + index)}. ` : '- ']))
    .join('\n');
}

// A figure as an image with its caption; one with no address is written as its caption alone.
function figureOf(node: StoredNode, writing: Writing): string | null {
  const address = assetAddress(node, writing.values);
  const { alt, caption } = node.attrs ?? {};
  if (!address) return text(caption) ? `*${escapeText(text(caption))}*` : null;
  return captioned(`![${escapeText(text(alt))}](${linkAddress(address)})`, caption);
}

const fenced = (code: string, language: unknown) =>
  codeFence(code, text(language) === 'plaintext' ? '' : text(language));

// The tags of HTML that end a line of text.
const BREAKING_TAGS = /<\/?(?:p|div|br|li|tr|h[1-6]|ul|ol|table|blockquote)\b[^>]*>/gi;
const ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

// Stands for a variable the host gives no value, kept apart from the text escaped around it.
const UNRESOLVED = /\0([\w.-]+)\0/g;

// A template block as its text: its HTML source with each variable's value, without its tags; a
// variable without one is written as its key in braces, which reads back as the variable.
function templateBlockOf(node: StoredNode, writing: Writing): string | null {
  const source = text(node.attrs?.source).replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => {
    const value = writing.values.variable?.(String(key));
    return typeof value === 'string' ? value.replaceAll('\0', '') : `\0${String(key)}\0`;
  });
  const lines = source
    .replace(BREAKING_TAGS, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity] ?? entity)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length
    ? lines
        .map((line) => escapeLineStart(escapeText(line)).replace(UNRESOLVED, '{{$1}}'))
        .join('\n\n')
    : null;
}

// A paragraph's lines; the spaces it starts with are left out, since Markdown reads a paragraph
// without them, and four of them as code.
const paragraphOf = (node: StoredNode, writing: Writing) =>
  inlines(node.content, writing)
    .replace(/^[ \t]+/, '')
    .split('\n')
    .map(escapeLineStart)
    .join('\n');

// The writers of the blocks a document holds, by stored type; a block of another type writes its
// content's blocks, and one without content is left out.
const BLOCKS: Readonly<Record<string, (node: StoredNode, writing: Writing) => string | null>> = {
  paragraph: paragraphOf,
  heading: (node, writing) => {
    const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1));
    const content = inlines(node.content, { ...writing, inHeading: true });
    return `${'#'.repeat(level)} ${escapeHeadingEnd(content)}`;
  },
  bulletList: listOf,
  orderedList: listOf,
  blockquote: (node, writing) =>
    prefixed(blocks(node.content, writing).join('\n\n'), ['> ', '> ', '>']),
  codeBlock: (node) =>
    captioned(fenced(inlineText(node.content), node.attrs?.language), node.attrs?.caption),
  linkedCode: (node) => fenced(text(node.attrs?.code), node.attrs?.language),
  mathBlock: (node) => `$$\n${storedMathSource(node)}\n$$`,
  table: (node, writing) => tableOf(node, writing, blocks),
  figure: figureOf,
  templateBlock: templateBlockOf,
  rule: () => '---',
  pageBreak: () => null,
  contents: () => null,
};

// A block's Markdown, or null for a block it leaves out, such as a figure a suggestion inserts when
// the suggestions are rejected.
function blockOf(node: StoredNode, writing: Writing): string | null {
  if (isLeftOut(node, writing.suggestions)) return null;
  const write = BLOCKS[node.type];
  if (write) return write(node, writing);
  return node.content ? blocks(node.content, writing).join('\n\n') : null;
}

/** A run of blocks as Markdown, one string for each block written. */
export function blocks(content: readonly StoredNode[] | undefined, writing: Writing): string[] {
  return (content ?? [])
    .map((node) => blockOf(node, writing))
    .filter((block): block is string => block !== null && block.trim() !== '');
}
