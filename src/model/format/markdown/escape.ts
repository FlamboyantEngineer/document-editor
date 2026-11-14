// How Markdown text, code, link addresses and titles are written so that they read back as what
// they are: the characters Markdown reads as formatting escaped, code fenced by a longer run of
// backticks than it holds, and addresses written so a space or a parenthesis cannot end them.

/**
 * Escapes the characters Markdown would read as formatting or math, an entity it would decode, and
 * a double brace that would open a variable.
 */
export const escapeText = (value: string): string =>
  value
    .replace(/([\\`*_[\]<>|~$])/g, '\\$1')
    .replace(/&(?=#?\w+;)/g, '\\&')
    .replace(/\{(?=\{)/g, '\\{');

/** Inline math's source between dollar signs: a dollar sign no backslash escapes, escaped. */
export const mathText = (source: string): string =>
  source.replace(/\\[\s\S]|\$/g, (found) => (found === '$' ? '\\$' : found));

/**
 * Escapes what Markdown would read at the start of a line as a block: a heading (`# `), a list item
 * (`- `, `+ `, `1. `, `1) `), and a rule or a heading underline (`---`, `===`). A quote's `>` and a
 * rule of `*` or `_` are escaped as formatting already.
 */
export const escapeLineStart = (line: string): string =>
  line
    .replace(/^(\s*)(#{1,6}(?:\s|$)|[-+](?:\s|$)|-{3,}\s*$|=+\s*$)/, '$1\\$2')
    .replace(/^(\s*\d{1,9})([.)])(?=\s|$)/, '$1\\$2');

/** Escapes a heading's closing run of number signs, which Markdown would drop. */
export const escapeHeadingEnd = (value: string): string =>
  value.replace(/(\s)(#+)(\s*)$/, '$1\\$2$3');

// The longest run of backticks in a value.
const longestBackticks = (value: string) =>
  Math.max(0, ...(value.match(/`+/g) ?? []).map((run) => run.length));

/** Code as an inline code span: fenced by one backtick more than its longest run. */
export function codeSpan(value: string): string {
  const fence = '`'.repeat(longestBackticks(value) + 1);
  // A space keeps a backtick at an edge from joining the fence; Markdown strips one on each side.
  const pad = /^`|`$|^ .* $/s.test(value) ? ' ' : '';
  return `${fence}${pad}${value}${pad}${fence}`;
}

/** A fenced code block: its fence one backtick longer than any run in the code, three at least. */
export function codeFence(code: string, language: string): string {
  const fence = '`'.repeat(Math.max(3, longestBackticks(code) + 1));
  return `${fence}${language}\n${code}\n${fence}`;
}

/**
 * A link or image address as Markdown reads it: a space, a control character or a backslash
 * encoded, and a parenthesis escaped, so none of them ends the address.
 */
export const linkAddress = (value: string): string =>
  value
    .replace(/[\s\\\p{Cc}]/gu, (character) => encodeURIComponent(character))
    .replace(/[()]/g, '\\$&');

/** A link's title as Markdown writes it after the address, quoted. */
export const linkTitle = (value: string): string => ` "${value.replace(/(["\\])/g, '\\$1')}"`;
