// `{{key}}` variables for the Markdown reader: two braces, a key of letters, digits, `_`, `.` and
// `-`, and two braces, read as a variable unless a backslash escapes the first brace, which
// markdown-it's escape rule then reads as text before this rule sees it.

import type { MarkdownIt, StateInline } from 'markdown-it';

const VARIABLE = /\{\{([\w.-]+)\}\}/y;

/** The inline rule reading `{{key}}` as a `variable` token whose `meta.key` is the key. */
export function variables(md: MarkdownIt): void {
  md.inline.ruler.before('escape', 'variable', (state: StateInline, silent: boolean) => {
    if (state.src.charCodeAt(state.pos) !== 0x7b) return false;
    VARIABLE.lastIndex = state.pos;
    const match = VARIABLE.exec(state.src);
    if (!match) return false;
    if (!silent) state.push('variable', '', 0).meta = { key: match[1] };
    state.pos = VARIABLE.lastIndex;
    return true;
  });
}
