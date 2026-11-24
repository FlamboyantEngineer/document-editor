// Markdown's inline content, as markdown-it tokenizes it, read into stored inline content:
// emphasis, strong, strikethrough, code, links and images, inline math, footnote references, line
// breaks, the HTML tags for underline, superscript, subscript, strikethrough, emphasis, strong and
// code, and `{{key}}` variables. Other HTML tags are left out with a warning, keeping their text.

import type { Token } from 'markdown-it';
import type { ImportWarnings } from '../../import/import-warnings.js';
import { joinText, textNode, withMark } from '../../import/stored-inline.js';
import type { StoredMark, StoredNode } from './document-format.js';

/** What inline reading needs from the whole document. */
export interface InlineContext {
  /** Each footnote definition's tokens, by the footnote plugin's id. */
  readonly notes: ReadonlyMap<number, readonly Token[]>;
  /** Each footnote's stored text once read, by the same id. */
  readonly noteText: Map<number, StoredNode[]>;
  readonly warnings: ImportWarnings;
  /** Whether footnote references are read; not inside a footnote's own text. */
  readonly inNote?: boolean | undefined;
}

const HTML_MARKS: ReadonlyMap<string, StoredMark> = new Map([
  ['u', { type: 'underline' }],
  ['ins', { type: 'underline' }],
  ['sup', { type: 'superscript' }],
  ['sub', { type: 'subscript' }],
  ['s', { type: 'strike' }],
  ['del', { type: 'strike' }],
  ['strike', { type: 'strike' }],
  ['em', { type: 'italic' }],
  ['i', { type: 'italic' }],
  ['strong', { type: 'bold' }],
  ['b', { type: 'bold' }],
  ['code', { type: 'code' }],
]);

const FORMATS: Readonly<Record<string, StoredMark>> = {
  em_open: { type: 'italic' },
  strong_open: { type: 'bold' },
  s_open: { type: 'strike' },
};

const TAG = /^<(\/?)([a-zA-Z][\w-]*)[^>]*>$/;

interface Tag {
  readonly closing: boolean;
  readonly name: string;
}

const tagOf = (token: Token): Tag | null => {
  const tag = token.type === 'html_inline' ? TAG.exec(token.content) : null;
  return tag ? { closing: tag[1] === '/', name: (tag[2] ?? '').toLowerCase() } : null;
};

// For each opening formatting tag among the tokens, the index of the tag that closes it.
function closingTags(tokens: readonly Token[]): Map<number, number> {
  const open = new Map<string, number[]>();
  const pairs = new Map<number, number>();
  tokens.forEach((token, index) => {
    const tag = tagOf(token);
    if (!tag || !HTML_MARKS.has(tag.name)) return;
    const stack = open.get(tag.name) ?? [];
    open.set(tag.name, stack);
    if (!tag.closing) stack.push(index);
    else {
      const opening = stack.pop();
      if (opening !== undefined) pairs.set(opening, index);
    }
  });
  return pairs;
}

const linkMark = (token: Token): StoredMark => {
  const title = token.attrGet('title');
  return {
    type: 'link',
    attrs: { href: token.attrGet('href') ?? '', ...(title ? { title } : {}) },
  };
};

// A footnote's text: its paragraphs' content, one space between them, and the text of any other
// block it holds, since a footnote holds no blocks. Read once, however often it is referenced.
function noteContent(id: number, context: InlineContext): StoredNode[] {
  const known = context.noteText.get(id);
  if (known) return known;
  const inner = { ...context, inNote: true };
  const parts = (context.notes.get(id) ?? []).flatMap((token) => {
    if (token.type === 'inline') return [readInline(token.children ?? [], inner)];
    if (token.type === 'fence' || token.type === 'code_block' || token.type === 'math_block')
      return [[textNode(token.content.trim(), [])]];
    return [];
  });
  const content = joinText(parts.flatMap((part, at) => (at ? [textNode(' ', []), ...part] : part)));
  context.noteText.set(id, content);
  return content;
}

function footnoteOf(token: Token, marks: readonly StoredMark[], context: InlineContext) {
  const { id, label } = token.meta as { id: number; label?: string };
  if (context.inNote || label === undefined) return [textNode(`[^${label ?? ''}]`, marks)];
  const content = noteContent(id, context);
  return [{ type: 'footnote', ...(content.length ? { content } : {}) }];
}

function htmlOf(token: Token, context: InlineContext): StoredNode[] {
  const tag = tagOf(token);
  if (tag?.name === 'br') return [{ type: 'lineBreak' }];
  context.warnings.add('content-left-out', tag ? `<${tag.name}>` : 'HTML');
  return [];
}

// One leaf token's stored inline content in `marks`.
function leafOf(token: Token, marks: readonly StoredMark[], context: InlineContext): StoredNode[] {
  switch (token.type) {
    case 'text':
      return [textNode(token.content, marks)];
    case 'softbreak':
      return [textNode(' ', marks)];
    case 'hardbreak':
      return [{ type: 'lineBreak' }];
    case 'code_inline':
      return [textNode(token.content, withMark(marks, { type: 'code' }))];
    case 'math_inline':
      return [{ type: 'math', attrs: { source: token.content } }];
    case 'variable':
      return [{ type: 'variable', attrs: { key: (token.meta as { key: string }).key } }];
    case 'image': {
      const alt = token.content;
      return [
        { type: 'image', attrs: { src: token.attrGet('src') ?? '', ...(alt ? { alt } : {}) } },
      ];
    }
    case 'footnote_ref':
      return footnoteOf(token, marks, context);
    case 'html_inline':
      return htmlOf(token, context);
    default:
      return [];
  }
}

/** markdown-it inline tokens as stored inline content, each in `marks` and those it adds. */
export function readInline(
  tokens: readonly Token[],
  context: InlineContext,
  marks: readonly StoredMark[] = [],
): StoredNode[] {
  const pairs = closingTags(tokens);
  const closes = new Set<number>();
  const outer: (readonly StoredMark[])[] = [];
  let current = marks;
  const out: StoredNode[] = [];
  tokens.forEach((token, index) => {
    const format = FORMATS[token.type];
    const tagMark = HTML_MARKS.get(tagOf(token)?.name ?? '');
    const closing = pairs.get(index);
    if (format || token.type === 'link_open' || (tagMark && closing !== undefined)) {
      if (closing !== undefined) closes.add(closing);
      outer.push(current);
      current = withMark(current, format ?? tagMark ?? linkMark(token));
    } else if (token.nesting === -1 || closes.has(index)) current = outer.pop() ?? marks;
    else out.push(...leafOf(token, current, context));
  });
  return joinText(out);
}
