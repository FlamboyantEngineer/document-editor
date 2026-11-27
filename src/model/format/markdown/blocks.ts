// A document's blocks as Markdown: headings, paragraphs, lists, quotes, code, math, tables,
// figures, rules, template blocks and lists of abbreviations, as tables. A block a suggestion
// leaves out, a page break and any other list of contents are left out.

import { storedBodyOf } from '../../schema/caption-content.js';
import { storedMathSource, type StoredNode } from '../document-format.js';
import { isLeftOut } from '../left-out.js';
import { assetAddress } from '../writer-values.js';
import { abbreviationTable } from './abbreviations.js';
import { codeFence, escapeHeadingEnd, escapeLineStart, escapeText, linkAddress } from './escape.js';
import { captionLine, inlines } from './inlines.js';
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
const captioned = (block: string, caption: string) => (caption ? `${block}\n\n${caption}` : block);

function listOf(node: StoredNode, writing: Writing): string {
  const ordered = node.type === 'orderedList';
  const start = typeof node.attrs?.start === 'number' ? node.attrs.start : 1;
  // An item whose blocks are all left out, as by a suggestion, is left out with its marker.
  // A checklist item leads with its box, as task lists write it: `- [ ] ` or `- [x] `.
  const box = (item: StoredNode) =>
    typeof item.attrs?.checked === 'boolean' ? (item.attrs.checked ? '[x] ' : '[ ] ') : '';
  return (node.content ?? [])
    .map((item) => ({ item, text: blocks(item.content, writing).join('\n\n') }))
    .filter(({ text: written }) => written !== '')
    .map(({ item, text: written }, index) =>
      prefixed(`${box(item)}${written}`, [ordered ? `${String(start + index)}. ` : '- ']),
    )
    .join('\n');
}

// A figure as an image with its caption; one with no address is written as its caption alone.
function figureOf(node: StoredNode, writing: Writing): string | null {
  const address = assetAddress(node, writing.values);
  const alt = node.attrs?.alt;
  const caption = captionLine(node, writing);
  if (!address) return caption || null;
  return captioned(`![${escapeText(text(alt))}](${linkAddress(address)})`, caption);
}

const fenced = (code: string, language: unknown) =>
  codeFence(code, text(language) === 'plaintext' ? '' : text(language));

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
  codeBlock: (node, writing) =>
    captioned(
      fenced(inlineText(storedBodyOf(node)), node.attrs?.language),
      captionLine(node, writing),
    ),
  linkedCode: (node) => fenced(text(node.attrs?.code), node.attrs?.language),
  mathBlock: (node) => `$$\n${storedMathSource(node)}\n$$`,
  table: (node, writing) => tableOf(node, writing, blocks),
  figure: figureOf,
  rule: () => '---',
  pageBreak: () => null,
  contents: (node, writing) =>
    node.attrs?.kind === 'abbreviations' ? abbreviationTable(writing.abbreviations ?? []) : null,
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
