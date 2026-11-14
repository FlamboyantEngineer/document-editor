// Markdown links' targets as the reader finds them: the label in brackets, then an inline address
// and title in parentheses or a reference to a link definition. An inline address holds balanced
// parentheses and escaped ones, or is given in angle brackets.

import type { InlineContext } from './markdown-read-inline.js';

/** The ASCII punctuation a backslash escapes. */
export const PUNCTUATION = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;

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

const unescaped = (value: string) => value.replace(/\\([!-/:-@[-`{-~])/g, '$1');

// The end of a bare link address from `from`: at a space, a control character or a parenthesis
// that closes none it opened; -1 when one it opened is left open.
function bareAddressEnd(source: string, from: number): number {
  let depth = 0;
  for (let at = from; at < source.length; at += 1) {
    const char = source[at] ?? '';
    if (char === '\\' && PUNCTUATION.test(source[at + 1] ?? '')) at += 1;
    else if (/[\s\p{Cc}]/u.test(char) || (char === ')' && depth === 0)) return depth ? -1 : at;
    else if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
  }
  return depth ? -1 : source.length;
}

// An inline link's address from `from`, in angle brackets or bare with balanced parentheses, and
// the index past it; its escapes read.
function linkAddress(source: string, from: number): { href: string; end: number } | null {
  if (source[from] === '<') {
    const angled = /^<((?:[^<>\n\\]|\\.)*)>/.exec(source.slice(from));
    return angled ? { href: unescaped(angled[1] ?? ''), end: from + angled[0].length } : null;
  }
  const end = bareAddressEnd(source, from);
  return end === -1 ? null : { href: unescaped(source.slice(from, end)), end };
}

// An inline link's `(address "title")` after its label's closing bracket at `close`.
function inlineTarget(source: string, close: number) {
  if (source[close + 1] !== '(') return null;
  const from = close + 2 + (/^\s*/.exec(source.slice(close + 2))?.[0].length ?? 0);
  const address = linkAddress(source, from);
  const rest = address && /^(?:\s+"((?:[^"\\]|\\.)*)")?\s*\)/.exec(source.slice(address.end));
  if (!address || !rest) return null;
  return {
    href: address.href,
    title: rest[1]?.replace(/\\(.)/g, '$1'),
    end: address.end + rest[0].length,
  };
}

/** A bracketed label at `at` and what follows it: an inline `(href "title")` or a `[reference]`. */
export function linkTarget(source: string, at: number, context: InlineContext) {
  const close = closingBracket(source, at);
  if (close === -1) return null;
  const label = source.slice(at + 1, close);
  const inline = inlineTarget(source, close);
  if (inline) return { label, ...inline };
  const reference = /^\[([^\]]*)\]/.exec(source.slice(close + 1));
  const key = (reference?.[1] || label).toLowerCase();
  const href = context.links.get(key);
  if (href === undefined) return null;
  return { label, href, title: undefined, end: close + 1 + (reference?.[0].length ?? 0) };
}
