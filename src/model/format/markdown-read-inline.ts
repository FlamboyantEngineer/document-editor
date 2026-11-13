// Markdown's inline syntax read into stored inline content: emphasis, strong, strikethrough, code,
// links and images, inline math, footnote references, line breaks, the HTML tags the writer uses
// for underline, superscript and subscript, and `{{key}}` variables. Other HTML tags are dropped,
// keeping their text.

import type { ImportWarnings } from '../../import/import-warnings.js';
import { joinText, textNode, withMark } from '../../import/stored-inline.js';
import type { StoredMark, StoredNode } from './document-format.js';

/** What inline reading needs from the whole document. */
export interface InlineContext {
  /** Link reference definitions, by lower-case label. */
  readonly links: ReadonlyMap<string, string>;
  /** Footnote definitions' raw text, by label. */
  readonly notes: ReadonlyMap<string, string>;
  readonly warnings: ImportWarnings;
  /** Whether footnote references are read; not inside a footnote's own text. */
  readonly inNote?: boolean | undefined;
}

interface Match {
  readonly nodes: StoredNode[];
  /** The index just past what was read. */
  readonly end: number;
}

/** The text being read, the marks around it and the document's context. */
interface Scan {
  readonly source: string;
  readonly marks: StoredMark[];
  readonly context: InlineContext;
}

type Reader = (scan: Scan, at: number) => Match | null;

const PUNCTUATION = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;

// The index of the closing delimiter of a span opened before `from`, skipping escapes and code.
function closing(source: string, from: number, delimiter: string): number {
  for (let at = from; at < source.length; at += 1) {
    const char = source[at];
    if (char === '\\') at += 1;
    else if (char === '`') {
      const run = /^`+/.exec(source.slice(at))?.[0] ?? '`';
      const end = source.indexOf(run, at + run.length);
      if (end !== -1) at = end + run.length - 1;
    } else if (source.startsWith(delimiter, at) && !/\s/.test(source[at - 1] ?? ' ')) {
      // In a longer run of the delimiter's character, the span closes at the run's end.
      const run = /^(.)\1*/.exec(source.slice(at))?.[0].length ?? delimiter.length;
      const end = at + run - delimiter.length;
      if (delimiter[0] !== '_' || !/\w/.test(source[at + run] ?? '')) return end;
    }
  }
  return -1;
}

const DELIMITERS: readonly (readonly [string, StoredMark])[] = [
  ['**', { type: 'bold' }],
  ['__', { type: 'bold' }],
  ['~~', { type: 'strike' }],
  ['*', { type: 'italic' }],
  ['_', { type: 'italic' }],
];

const emphasis: Reader = ({ source, marks, context }, at) => {
  for (const [delimiter, mark] of DELIMITERS) {
    if (!source.startsWith(delimiter, at)) continue;
    const start = at + delimiter.length;
    if (/\s/.test(source[start] ?? ' ')) continue;
    if (delimiter[0] === '_' && /\w/.test(source[at - 1] ?? '')) continue;
    const end = closing(source, start, delimiter);
    if (end <= start) continue;
    const inner = readInline(source.slice(start, end), context, withMark(marks, mark));
    return { nodes: inner, end: end + delimiter.length };
  }
  return null;
};

const code: Reader = ({ source, marks }, at) => {
  const run = /^`+/.exec(source.slice(at))?.[0] ?? '';
  const end = source.indexOf(run, at + run.length);
  if (!run || end === -1 || source[end + run.length] === '`') return null;
  let value = source.slice(at + run.length, end).replace(/\n/g, ' ');
  if (/^ .*[^ ].* $/.test(value)) value = value.slice(1, -1);
  return { nodes: [textNode(value, withMark(marks, { type: 'code' }))], end: end + run.length };
};

const math: Reader = ({ source }, at) => {
  if (source[at + 1] === '$' || /\s/.test(source[at + 1] ?? ' ')) return null;
  const end = source.indexOf('$', at + 1);
  if (end === -1 || /\s/.test(source[end - 1] ?? ' ')) return null;
  return {
    nodes: [{ type: 'math', attrs: { source: source.slice(at + 1, end) } }],
    end: end + 1,
  };
};

// The index of the bracket that closes the one at `at`, skipping escapes and nested brackets.
function closingBracket(source: string, at: number): number {
  let depth = 0;
  for (let index = at; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\\') index += 1;
    else if (char === '[') depth += 1;
    else if (char === ']' && --depth === 0) return index;
  }
  return -1;
}

// A bracketed label and what follows it: an inline `(href "title")` or a `[reference]`.
function linkTarget(source: string, at: number, context: InlineContext) {
  const close = closingBracket(source, at);
  if (close === -1) return null;
  const label = source.slice(at + 1, close);
  const inline = /^\(\s*<?([^\s)>]*)>?(?:\s+"((?:[^"\\]|\\.)*)")?\s*\)/.exec(
    source.slice(close + 1),
  );
  if (inline) {
    const title = inline[2]?.replace(/\\(.)/g, '$1');
    return { label, href: inline[1] ?? '', title, end: close + 1 + inline[0].length };
  }
  const reference = /^\[([^\]]*)\]/.exec(source.slice(close + 1));
  const key = (reference?.[1] || label).toLowerCase();
  const href = context.links.get(key);
  if (href === undefined) return null;
  return { label, href, end: close + 1 + (reference?.[0].length ?? 0) };
}

const link: Reader = ({ source, marks, context }, at) => {
  const target = linkTarget(source, at, context);
  if (!target) return null;
  const inner = readInline(
    target.label,
    context,
    withMark(marks, {
      type: 'link',
      attrs: { href: target.href, ...(target.title ? { title: target.title } : {}) },
    }),
  );
  return { nodes: inner, end: target.end };
};

const image: Reader = ({ source, context }, at) => {
  const target = source[at + 1] === '[' ? linkTarget(source, at + 1, context) : null;
  if (!target) return null;
  const alt = target.label.replace(/\\(.)/g, '$1');
  return {
    nodes: [{ type: 'image', attrs: { src: target.href, ...(alt ? { alt } : {}) } }],
    end: target.end,
  };
};

const footnote: Reader = ({ source, context }, at) => {
  const label = /^\[\^([^\]\s]+)\]/.exec(source.slice(at));
  const note = label ? context.notes.get(label[1] ?? '') : undefined;
  if (!label || note === undefined || context.inNote) return null;
  const content = readInline(note, { ...context, inNote: true }, []);
  return {
    nodes: [{ type: 'footnote', ...(content.length ? { content } : {}) }],
    end: at + label[0].length,
  };
};

const HTML_MARKS: Readonly<Record<string, StoredMark>> = {
  u: { type: 'underline' },
  ins: { type: 'underline' },
  sup: { type: 'superscript' },
  sub: { type: 'subscript' },
  s: { type: 'strike' },
  del: { type: 'strike' },
  em: { type: 'italic' },
  i: { type: 'italic' },
  strong: { type: 'bold' },
  b: { type: 'bold' },
  code: { type: 'code' },
};

const html: Reader = ({ source, marks, context }, at) => {
  const autolink = /^<((?:https?|mailto):[^\s>]+)>/.exec(source.slice(at));
  if (autolink) {
    const href = autolink[1] ?? '';
    return {
      nodes: [textNode(href, withMark(marks, { type: 'link', attrs: { href } }))],
      end: at + autolink[0].length,
    };
  }
  const tag = /^<(\/?)([a-zA-Z][\w-]*)[^>]*?(\/?)>/.exec(source.slice(at));
  if (!tag) return null;
  const name = (tag[2] ?? '').toLowerCase();
  if (name === 'br') return { nodes: [{ type: 'lineBreak' }], end: at + tag[0].length };
  const mark = HTML_MARKS[name];
  const end = mark && !tag[1] ? source.toLowerCase().indexOf(`</${name}>`, at + tag[0].length) : -1;
  if (mark && end !== -1) {
    const inner = readInline(source.slice(at + tag[0].length, end), context, withMark(marks, mark));
    return { nodes: inner, end: end + name.length + 3 };
  }
  context.warnings.add('content-left-out', `<${name}>`);
  return { nodes: [], end: at + tag[0].length };
};

const variable: Reader = ({ source }, at) => {
  const found = /^\{\{([\w.-]+)\}\}/.exec(source.slice(at));
  return found
    ? { nodes: [{ type: 'variable', attrs: { key: found[1] } }], end: at + found[0].length }
    : null;
};

const breaks: Reader = ({ source, marks }, at) => {
  if (source[at] === '\\' && source[at + 1] === '\n')
    return { nodes: [{ type: 'lineBreak' }], end: at + 2 };
  if (source[at] === '\\' && PUNCTUATION.test(source[at + 1] ?? '')) {
    return { nodes: [textNode(source[at + 1] ?? '', marks)], end: at + 2 };
  }
  const hard = /^ {2,}\n/.exec(source.slice(at));
  if (hard) return { nodes: [{ type: 'lineBreak' }], end: at + hard[0].length };
  const soft = /^ *\n */.exec(source.slice(at));
  return soft ? { nodes: [textNode(' ', marks)], end: at + soft[0].length } : null;
};

const READERS: Readonly<Record<string, readonly Reader[]>> = {
  '*': [emphasis],
  _: [emphasis],
  '~': [emphasis],
  '`': [code],
  $: [math],
  '[': [footnote, link],
  '!': [image],
  '<': [html],
  '{': [variable],
  '\\': [breaks],
  ' ': [breaks],
  '\n': [breaks],
};

/** Markdown inline text as stored inline content, each node in `marks` and those it adds. */
export function readInline(
  source: string,
  context: InlineContext,
  marks: StoredMark[] = [],
): StoredNode[] {
  const nodes: StoredNode[] = [];
  let plain = '';
  let at = 0;
  while (at < source.length) {
    const char = source[at] ?? '';
    const match = (READERS[char] ?? []).reduce<Match | null>(
      (found, read) => found ?? read({ source, marks, context }, at),
      null,
    );
    if (!match) {
      plain += char;
      at += 1;
      continue;
    }
    if (plain) nodes.push(textNode(plain, marks));
    plain = '';
    nodes.push(...match.nodes);
    at = match.end;
  }
  if (plain) nodes.push(textNode(plain, marks));
  return joinText(nodes);
}
