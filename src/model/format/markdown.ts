// A stored document as Markdown, with GitHub's tables, strikethrough and footnotes: its headings,
// paragraphs, lists, quotes, code, math, tables and figures, its suggestions accepted or rejected,
// and its footnotes as numbered definitions at the end. Formats Markdown lacks, such as underline,
// superscript and subscript, are written as HTML.

import { safeHref } from '../schema/dom-attributes.js';
import {
  type DocumentFile,
  type StoredMark,
  storedMathSource,
  type StoredNode,
} from './document-format.js';

/** How `writeMarkdown` writes a document. */
export interface MarkdownOptions {
  /** Whether the suggestions are written as if accepted (the default) or rejected. */
  readonly suggestions?: 'accepted' | 'rejected' | undefined;
}

interface Writing {
  readonly suggestions: 'accepted' | 'rejected';
  /** The footnotes' definitions, in the order cited. */
  readonly footnotes: string[];
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');

// Escapes the characters Markdown would read as formatting.
const escape = (value: string) => value.replace(/([\\`*_[\]<>|~])/g, '\\$1');

const MARKS: Readonly<Record<string, readonly [string, string]>> = {
  bold: ['**', '**'],
  italic: ['*', '*'],
  strike: ['~~', '~~'],
  underline: ['<u>', '</u>'],
  superscript: ['<sup>', '</sup>'],
  subscript: ['<sub>', '</sub>'],
};

// Whether a suggestion leaves a node out: an insertion rejected, or a deletion accepted.
function leftOut(marks: readonly StoredMark[] | undefined, writing: Writing): boolean {
  const out = writing.suggestions === 'accepted' ? 'deletion' : 'insertion';
  return (marks ?? []).some((mark) => mark.type === out);
}

// A text node's Markdown, in its marks.
function markedText(node: StoredNode): string {
  const marks = node.marks ?? [];
  if (marks.some((mark) => mark.type === 'code')) {
    const value = text(node.text);
    const fence = value.includes('`') ? '``' : '`';
    return `${fence}${value}${fence}`;
  }
  let value = escape(text(node.text));
  for (const mark of marks) {
    const wrap = MARKS[mark.type];
    if (wrap) value = `${wrap[0]}${value}${wrap[1]}`;
  }
  // A link with an address a link may not hold is written as its text.
  const href = safeHref(marks.find((mark) => mark.type === 'link')?.attrs?.href);
  return href === null ? value : `[${value}](${href})`;
}

// An inline node's Markdown.
function inlineOf(node: StoredNode, writing: Writing): string {
  if (leftOut(node.marks, writing)) return '';
  switch (node.type) {
    case 'text':
      return markedText(node);
    case 'lineBreak':
      return '\\\n';
    case 'math':
      return `$${storedMathSource(node)}$`;
    case 'footnote': {
      writing.footnotes.push(inlines(node.content, writing));
      return `[^${String(writing.footnotes.length)}]`;
    }
    case 'abbreviation': {
      const { abbreviation, expansion, display } = node.attrs ?? {};
      return display === 'short'
        ? escape(text(abbreviation))
        : escape(`${text(expansion)} (${text(abbreviation)})`);
    }
    case 'mention':
      return `@${escape(text(node.attrs?.label))}`;
    case 'variable':
      return `{{${text(node.attrs?.key)}}}`;
    default:
      return inlines(node.content, writing);
  }
}

const inlineText = (content: readonly StoredNode[] | undefined) =>
  (content ?? []).map((node) => text(node.text)).join('');

const inlines = (content: readonly StoredNode[] | undefined, writing: Writing) =>
  (content ?? []).map((node) => inlineOf(node, writing)).join('');

// Prefixes every line of a block, the first with `first` and the others with `rest`.
const prefixed = (block: string, first: string, rest = ' '.repeat(first.length)) =>
  block
    .split('\n')
    .map((line, index) => (line ? `${index === 0 ? first : rest}${line}` : line))
    .join('\n');

function listOf(node: StoredNode, writing: Writing): string {
  const ordered = node.type === 'orderedList';
  const start = typeof node.attrs?.start === 'number' ? node.attrs.start : 1;
  return (node.content ?? [])
    .map((item, index) => {
      const marker = ordered ? `${String(start + index)}. ` : '- ';
      return prefixed(blocks(item.content, writing).join('\n\n'), marker);
    })
    .join('\n');
}

function tableOf(node: StoredNode, writing: Writing): string {
  const rows = (node.content ?? []).map((row) =>
    (row.content ?? []).map((cell) =>
      blocks(cell.content, writing).join(' ').replace(/\n+/g, ' ').trim(),
    ),
  );
  const width = Math.max(1, ...rows.map((row) => row.length));
  const line = (cells: readonly string[]) =>
    `| ${Array.from({ length: width }, (_, index) => cells[index] ?? '').join(' | ')} |`;
  const [head = [], ...body] = rows;
  const caption = text(node.attrs?.caption);
  return [
    ...(caption ? [`*${escape(caption)}*`, ''] : []),
    line(head),
    `|${' --- |'.repeat(width)}`,
    ...body.map(line),
  ].join('\n');
}

function figureOf(node: StoredNode): string {
  const { src, alt, caption } = node.attrs ?? {};
  const image = `![${escape(text(alt))}](${text(src)})`;
  return text(caption) ? `${image}\n\n*${escape(text(caption))}*` : image;
}

const fenced = (code: string, language: unknown) => {
  const fence = code.includes('```') ? '````' : '```';
  const tag = text(language) === 'plaintext' ? '' : text(language);
  return `${fence}${tag}\n${code}\n${fence}`;
};

// The writers of the blocks a document holds, by stored type; a block of another type writes its
// content's blocks, and one without content is left out.
const BLOCKS: Readonly<Record<string, (node: StoredNode, writing: Writing) => string | null>> = {
  paragraph: (node, writing) => inlines(node.content, writing),
  heading: (node, writing) => {
    const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1));
    return `${'#'.repeat(level)} ${inlines(node.content, writing)}`;
  },
  bulletList: listOf,
  orderedList: listOf,
  blockquote: (node, writing) => prefixed(blocks(node.content, writing).join('\n\n'), '> ', '> '),
  codeBlock: (node) => fenced(inlineText(node.content), node.attrs?.language),
  linkedCode: (node) => fenced(text(node.attrs?.code), node.attrs?.language),
  mathBlock: (node) => `$$\n${storedMathSource(node)}\n$$`,
  table: tableOf,
  figure: figureOf,
  rule: () => '---',
  pageBreak: () => null,
  contents: () => null,
};

// A block's Markdown, or null for a block it leaves out.
function blockOf(node: StoredNode, writing: Writing): string | null {
  const write = BLOCKS[node.type];
  if (write) return write(node, writing);
  return node.content ? blocks(node.content, writing).join('\n\n') : null;
}

function blocks(content: readonly StoredNode[] | undefined, writing: Writing): string[] {
  return (content ?? [])
    .map((node) => blockOf(node, writing))
    .filter((block): block is string => block !== null && block.trim() !== '');
}

/** A stored document as Markdown, its footnotes defined at the end. */
export function writeMarkdown(file: DocumentFile, options: MarkdownOptions = {}): string {
  const writing: Writing = { suggestions: options.suggestions ?? 'accepted', footnotes: [] };
  const body = file.sections.flatMap((section) => blocks(section.content, writing));
  const notes = writing.footnotes.map((note, index) => `[^${String(index + 1)}]: ${note}`);
  return `${[...body, ...(notes.length ? [notes.join('\n')] : [])].join('\n\n')}\n`;
}
