// Markdown's blocks read into stored blocks: paragraphs and setext and ATX headings, fenced and
// indented code, `$$` display math, quotes, lists, GitHub tables, rules, and the figures and
// captions the library's writer gives. HTML blocks are left out with a warning.

import type { StoredNode } from './document-format.js';
import { closesFence, openingFence } from './markdown-read-fence.js';
import { type InlineContext, readInline } from './markdown-read-inline.js';

interface Lines {
  readonly lines: readonly string[];
  at: number;
}

type BlockReader = (lines: Lines, context: InlineContext) => StoredNode[] | null;

const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}> ?/;
const ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])(?:([ \t]+)(.*)|$)/;
const DELIMITER_ROW = /^ *\|? *:?-+:? *(?:\| *:?-+:? *)*\|? *$/;
const HTML_BLOCK =
  /^ {0,3}<(?:!--|\/?(?:div|p|table|pre|section|details|figure|ul|ol|h[1-6]|script|style)\b)/i;

const isBlank = (line: string | undefined) => line === undefined || line.trim() === '';

const paragraphOf = (text: string, context: InlineContext): StoredNode => {
  const content = readInline(text.trim(), context);
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
};

// Fenced code, with its language; a block with no lines is left empty.
const fenced: BlockReader = (lines) => {
  const open = openingFence(lines.lines[lines.at] ?? '');
  if (!open) return null;
  const code: string[] = [];
  lines.at += 1;
  while (lines.at < lines.lines.length) {
    const line = lines.lines[lines.at] ?? '';
    lines.at += 1;
    if (closesFence(line, open)) break;
    code.push(line);
  }
  const text = code.join('\n');
  return [
    {
      type: 'codeBlock',
      ...(open.language ? { attrs: { language: open.language } } : {}),
      ...(text ? { content: [{ type: 'text', text }] } : {}),
    },
  ];
};

const displayMath: BlockReader = (lines) => {
  const first = (lines.lines[lines.at] ?? '').trim();
  if (!first.startsWith('$$')) return null;
  const single = /^\$\$(.+)\$\$$/.exec(first);
  if (single) {
    lines.at += 1;
    return [{ type: 'mathBlock', attrs: { source: (single[1] ?? '').trim() } }];
  }
  if (first !== '$$') return null;
  const end = lines.lines.findIndex((line, index) => index > lines.at && line.trim() === '$$');
  if (end === -1) return null;
  const source = lines.lines.slice(lines.at + 1, end).join('\n');
  lines.at = end + 1;
  return [{ type: 'mathBlock', ...(source ? { attrs: { source } } : {}) }];
};

const heading: BlockReader = (lines, context) => {
  const match = HEADING.exec(lines.lines[lines.at] ?? '');
  if (!match) return null;
  lines.at += 1;
  const level = (match[1] ?? '#').length;
  const content = readInline(match[2] ?? '', context);
  return [
    {
      type: 'heading',
      ...(level > 1 ? { attrs: { level } } : {}),
      ...(content.length ? { content } : {}),
    },
  ];
};

const rule: BlockReader = (lines) => {
  if (!RULE.test(lines.lines[lines.at] ?? '')) return null;
  lines.at += 1;
  return [{ type: 'rule' }];
};

const quote: BlockReader = (lines, context) => {
  if (!QUOTE.test(lines.lines[lines.at] ?? '')) return null;
  const inner: string[] = [];
  while (lines.at < lines.lines.length && QUOTE.test(lines.lines[lines.at] ?? '')) {
    inner.push((lines.lines[lines.at] ?? '').replace(QUOTE, ''));
    lines.at += 1;
  }
  const content = readBlocks(inner, context);
  return [{ type: 'blockquote', content: content.length ? content : [{ type: 'paragraph' }] }];
};

const htmlBlock: BlockReader = (lines, context) => {
  if (!HTML_BLOCK.test(lines.lines[lines.at] ?? '')) return null;
  while (lines.at < lines.lines.length && !isBlank(lines.lines[lines.at])) lines.at += 1;
  context.warnings.add('content-left-out', 'HTML block');
  return [];
};

// A list item's lines with the item's indent taken off: its first line, then each line indented at
// least as far as its text, blank lines between, and lazy lines that continue its paragraph.
function itemLines(lines: Lines, indent: number, first: string): string[] {
  const own = [first];
  lines.at += 1;
  while (lines.at < lines.lines.length) {
    const line = lines.lines[lines.at] ?? '';
    const lead = /^ */.exec(line)?.[0].length ?? 0;
    if (isBlank(line)) {
      if (
        isBlank(lines.lines[lines.at + 1]) ||
        (/^ */.exec(lines.lines[lines.at + 1] ?? '')?.[0].length ?? 0) < indent
      )
        break;
      own.push('');
    } else if (lead >= indent) own.push(line.slice(indent));
    else if (!isBlank(own[own.length - 1]) && !startsBlock(line)) own.push(line.trim());
    else break;
    lines.at += 1;
  }
  return own;
}

// One list item at the cursor, when it is of the list's kind.
function listItem(lines: Lines, context: InlineContext, ordered: boolean): StoredNode | null {
  const item = ITEM.exec(lines.lines[lines.at] ?? '');
  if (!item || /\d/.test(item[2] ?? '') !== ordered) return null;
  const [, lead = '', marker = '', space = ' ', first = ''] = item;
  const indent = lead.length + marker.length + Math.min(4, Math.max(1, space.length));
  const content = readBlocks(itemLines(lines, indent, first), context);
  return { type: 'listItem', content: content.length ? content : [{ type: 'paragraph' }] };
}

const list: BlockReader = (lines, context) => {
  const first = ITEM.exec(lines.lines[lines.at] ?? '');
  if (!first) return null;
  const ordered = /\d/.test(first[2] ?? '');
  const items: StoredNode[] = [];
  for (
    let item = listItem(lines, context, ordered);
    item;
    item = listItem(lines, context, ordered)
  ) {
    items.push(item);
    while (isBlank(lines.lines[lines.at]) && ITEM.test(lines.lines[lines.at + 1] ?? ''))
      lines.at += 1;
  }
  const start = ordered ? Number.parseInt(first[2] ?? '1', 10) : 1;
  return [
    {
      type: ordered ? 'orderedList' : 'bulletList',
      ...(start !== 1 ? { attrs: { start } } : {}),
      content: items,
    },
  ];
};

const cellsOf = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'));

const table: BlockReader = (lines, context) => {
  const head = lines.lines[lines.at] ?? '';
  const delimiter = lines.lines[lines.at + 1] ?? '';
  if (!head.includes('|') || !DELIMITER_ROW.test(delimiter) || !delimiter.includes('-'))
    return null;
  const aligns = cellsOf(delimiter).map((cell) =>
    cell.endsWith(':') ? (cell.startsWith(':') ? 'center' : 'right') : null,
  );
  const width = aligns.length;
  const rowOf = (line: string, type: string): StoredNode => ({
    type: 'tableRow',
    content: Array.from({ length: width }, (_, index) => ({
      type,
      ...(aligns[index] ? { attrs: { align: aligns[index] } } : {}),
      content: [paragraphOf(cellsOf(line)[index] ?? '', context)],
    })),
  });
  const rows = [rowOf(head, 'tableHeader')];
  lines.at += 2;
  while (
    lines.at < lines.lines.length &&
    !isBlank(lines.lines[lines.at]) &&
    (lines.lines[lines.at] ?? '').includes('|')
  ) {
    rows.push(rowOf(lines.lines[lines.at] ?? '', 'tableCell'));
    lines.at += 1;
  }
  return [{ type: 'table', content: rows }];
};

const indentedCode: BlockReader = (lines) => {
  if (!/^( {4}|\t)/.test(lines.lines[lines.at] ?? '')) return null;
  const code: string[] = [];
  while (
    lines.at < lines.lines.length &&
    (/^( {4}|\t)/.test(lines.lines[lines.at] ?? '') || isBlank(lines.lines[lines.at]))
  ) {
    code.push((lines.lines[lines.at] ?? '').replace(/^( {4}|\t)/, ''));
    lines.at += 1;
  }
  while (isBlank(code[code.length - 1]) && code.length) code.pop();
  return [{ type: 'codeBlock', content: [{ type: 'text', text: code.join('\n') }] }];
};

const BLOCK_STARTS: readonly BlockReader[] = [
  fenced,
  displayMath,
  heading,
  rule,
  quote,
  htmlBlock,
  list,
];

// Whether a line starts a block other than a paragraph, ending the paragraph before it.
function startsBlock(line: string): boolean {
  return (
    openingFence(line) !== null ||
    [HEADING, RULE, QUOTE, HTML_BLOCK].some((pattern) => pattern.test(line)) ||
    line.trim() === '$$' ||
    ITEM.test(line)
  );
}

// A paragraph's lines up to a blank line or another block; a setext underline makes it a heading.
const paragraph: BlockReader = (lines, context) => {
  const text: string[] = [lines.lines[lines.at] ?? ''];
  lines.at += 1;
  while (lines.at < lines.lines.length) {
    const line = lines.lines[lines.at] ?? '';
    const setext = /^ {0,3}(=+|-+)[ \t]*$/.exec(line);
    if (setext) {
      lines.at += 1;
      const level = setext[1]?.startsWith('=') ? 1 : 2;
      const content = readInline(text.join('\n').trim(), context);
      return [
        {
          type: 'heading',
          ...(level > 1 ? { attrs: { level } } : {}),
          ...(content.length ? { content } : {}),
        },
      ];
    }
    if (isBlank(line) || startsBlock(line)) break;
    text.push(line);
    lines.at += 1;
  }
  return [paragraphOf(text.join('\n'), context)];
};

const READERS: readonly BlockReader[] = [...BLOCK_STARTS, table, indentedCode, paragraph];

/** Markdown lines as stored blocks. */
export function readBlocks(source: readonly string[], context: InlineContext): StoredNode[] {
  const lines: Lines = { lines: source, at: 0 };
  const blocks: StoredNode[] = [];
  while (lines.at < source.length) {
    if (isBlank(source[lines.at])) {
      lines.at += 1;
      continue;
    }
    for (const reader of READERS) {
      const read = reader(lines, context);
      if (read) {
        blocks.push(...read);
        break;
      }
    }
  }
  return withObjects(blocks);
}

// The text of a paragraph that is all italic text, which the writer gives a caption as; else null.
function captionText(node: StoredNode | undefined): string | null {
  const only = node?.type === 'paragraph' && node.content?.length === 1 ? node.content[0] : null;
  const italic =
    only?.type === 'text' && only.marks?.length === 1 && only.marks[0]?.type === 'italic';
  return italic ? (only.text ?? null) : null;
}

// The block after `last` with a caption paragraph taken in: into a figure before it, or into the
// table after it; null when it takes none.
function captioned(last: StoredNode | undefined, block: StoredNode): StoredNode | null {
  const caption = captionText(block);
  if (caption !== null && last?.type === 'figure' && last.attrs?.captionEnabled === false) {
    const { captionEnabled: _, ...attrs } = last.attrs;
    return { ...last, attrs: { ...attrs, caption } };
  }
  const above = captionText(last);
  if (block.type === 'table' && above !== null && !block.attrs?.caption) {
    return { ...block, attrs: { ...block.attrs, caption: above } };
  }
  return null;
}

// A paragraph holding only an image as a figure, and a caption paragraph taken into the table
// after it or the figure before it, as the writer places them.
function withObjects(blocks: readonly StoredNode[]): StoredNode[] {
  const out: StoredNode[] = [];
  for (const block of blocks) {
    const image =
      block.type === 'paragraph' && block.content?.length === 1 ? block.content[0] : null;
    const joined = captioned(out[out.length - 1], block);
    if (joined) out[out.length - 1] = joined;
    else if (image?.type === 'image') {
      out.push({ type: 'figure', attrs: { ...image.attrs, captionEnabled: false } });
    } else out.push(block);
  }
  return out;
}
