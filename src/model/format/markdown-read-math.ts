// Math for the Markdown reader, as markdown-it rules. Inline math sits between single dollar signs
// as Pandoc reads it: no space just inside either sign and no digit right after the closing one,
// so a price such as `$5-$10` stays text; a dollar sign a backslash escapes does not close it and
// stays in its source, and Markdown inside it, such as `*`, is not read. `$$…$$` within a line is
// math too, and display math when it is all its paragraph holds. Display math also sits on lines
// of its own between `$$` fences; text after the opening signs is the block's label.
//
// The first unescaped sign must be a valid closing sign. Skipping an invalid sign can swallow
// prose and the start of another formula. Once an opening finds no sign up to the end of its text,
// no later opening in that text looks again, and reading takes work in proportion to the text.

import type { MarkdownIt, StateBlock, StateInline } from 'markdown-it';

const DOLLAR = 0x24;
const BACKSLASH = 0x5c;

const isSpace = (code: number) => code === 0x20 || code === 0x09 || code === 0x0a;
const isDigit = (code: number) => code >= 0x30 && code <= 0x39;

/** Where in a text the openings that start at or after `from` are known to find no closing. */
interface Unclosed {
  src: string;
  single: number;
  double: number;
}

// The index of the first unescaped dollar sign after `start`, or -1.
function nextSingleDollar(src: string, start: number, max: number): number {
  for (let at = start + 1; at < max; at += 1) {
    const code = src.charCodeAt(at);
    if (code === BACKSLASH) at += 1;
    else if (code === DOLLAR) return at;
  }
  return -1;
}

// Where the math opened at the reading's place closes, or -1, noting an opening that finds no closing.
function closingOf(state: StateInline, unclosed: Unclosed): number {
  const { src, pos, posMax: max } = state;
  if (src.charCodeAt(pos + 1) === DOLLAR) {
    if (pos >= unclosed.double) return -1;
    const end = src.indexOf('$$', pos + 2);
    if (end < 0) unclosed.double = pos;
    return end === pos + 2 ? -1 : end;
  }
  if (pos >= unclosed.single || isSpace(src.charCodeAt(pos + 1))) return -1;
  const end = nextSingleDollar(src, pos, max);
  // A link's text is read with a shorter end: only a search to the text's end tells later ones.
  if (end < 0 && max === src.length) unclosed.single = pos;
  return end < 0 || isSpace(src.charCodeAt(end - 1)) || isDigit(src.charCodeAt(end + 1)) ? -1 : end;
}

function inlineMath(state: StateInline, silent: boolean, unclosed: Unclosed): boolean {
  const { src, pos, posMax: max } = state;
  if (src.charCodeAt(pos) !== DOLLAR) return false;
  if (unclosed.src !== src) Object.assign(unclosed, { src, single: Infinity, double: Infinity });
  const end = closingOf(state, unclosed);
  if (end < 0 || end >= max) return false;
  const signs = src.charCodeAt(pos + 1) === DOLLAR ? 2 : 1;
  if (!silent) {
    const token = state.push('math_inline', '', 0);
    token.content = src.slice(pos + signs, end);
    token.markup = signs === 2 ? '$$' : '$';
  }
  state.pos = end + signs;
  return true;
}

// A line, from its first non-space character, at `line` in the block's source.
const lineText = (state: StateBlock, line: number) =>
  state.src.slice((state.bMarks[line] ?? 0) + (state.tShift[line] ?? 0), state.eMarks[line]);

const FENCE = /^\$\$([^$]*)$/;

/** The arguments markdown-it gives a block rule. */
type BlockRule = [state: StateBlock, start: number, end: number, silent: boolean];

function mathBlock(...[state, start, end, silent]: BlockRule): boolean {
  if ((state.sCount[start] ?? 0) - state.blkIndent >= 4) return false;
  const opening = FENCE.exec(lineText(state, start));
  if (!opening) return false;
  if (silent) return true;
  let line = start + 1;
  let closed = false;
  for (; line < end; line += 1) {
    if (state.isEmpty(line) ? false : (state.sCount[line] ?? 0) < state.blkIndent) break;
    if (
      /^\$\$\s*$/.test(lineText(state, line)) &&
      (state.sCount[line] ?? 0) - state.blkIndent < 4
    ) {
      closed = true;
      break;
    }
  }
  const token = state.push('math_block', '', 0);
  token.content = state.getLines(start + 1, line, state.sCount[start] ?? 0, false);
  token.info = (opening[1] ?? '').trim();
  token.map = [start, line];
  state.line = line + (closed ? 1 : 0);
  return true;
}

/** The inline and block math rules, giving `math_inline` and `math_block` tokens. */
export function math(md: MarkdownIt): void {
  const unclosed: Unclosed = { src: '', single: Infinity, double: Infinity };
  md.inline.ruler.before('escape', 'math_inline', (state: StateInline, silent: boolean) =>
    inlineMath(state, silent, unclosed),
  );
  md.block.ruler.before('fence', 'math_block', mathBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
}
