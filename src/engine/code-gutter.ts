// A code block's gutter of line numbers: one line per line of code, its number, then a hidden copy
// of the line's text that wraps as the code does, so a wrapped line's later rows stay blank. On
// forced lines (DOCE-PAGINATION-11.2) the copy breaks where the engine's lines wrap the code.

import type { Decoration } from 'prosemirror-view';
import type { LineTable } from '../layout-engine/line-table.js';
import { codeElements, gutterDigits, gutterLine, gutterRows } from './code-drawing.js';

/**
 * The lines the pages draw a block on, which forced lines hand its element's view with its
 * decorations (DOCE-PAGINATION-11.2); null when the browser chooses its lines.
 */
export function forcedLinesIn(decorations: readonly Decoration[]): LineTable | null {
  for (const decoration of decorations) {
    const lines = (decoration.spec as { forcedLines?: LineTable }).forcedLines;
    if (lines) return lines;
  }
  return null;
}

// Where a code text's lines wrap on the lines it is drawn on: each line's end that is not at a line
// feed or the text's end.
function wrapsOf(text: string, table: LineTable): ReadonlySet<number> {
  const wraps = table.lines
    .slice(0, -1)
    .map((line) => line.to)
    .filter((to) => text[to - 1] !== '\n');
  return new Set(wraps);
}

// What each gutter line was drawn from: its number, whether on forced lines, and its pieces.
const drawnRows = new WeakMap<Element, string>();

// The gutter's lines, one per line of code: its number, then a hidden copy of the line's text,
// which the stylesheet lays out as wide as the code so a wrapped line keeps its rows blank after
// its number. On forced lines each line is marked `data-engine-lines` and its copy breaks where
// the code's line does, and wraps nowhere else. A line drawn from the same input keeps its element.
export function drawGutter(
  gutter: HTMLElement,
  text: string,
  at: { first: number; lines: LineTable | null },
) {
  const owner = gutter.ownerDocument;
  const { first } = at;
  const forced = at.lines !== null;
  const lines = gutterRows(text, at.lines ? wrapsOf(text, at.lines) : null);
  const kept = [...gutter.children];
  lines.forEach((pieces, index) => {
    const number = String(first + index);
    const key = `${number}|${String(forced)}|${pieces.join('\n')}`;
    const existing = kept[index];
    if (existing && drawnRows.get(existing) === key) return;
    const [row] = codeElements(owner, [gutterLine({ number, pieces, forced })]) as [Element];
    drawnRows.set(row, key);
    if (existing) existing.replaceWith(row);
    else gutter.appendChild(row);
  });
  for (const extra of kept.slice(lines.length)) extra.remove();
  // The digits of the highest number, at least three, from which the stylesheet sizes the gutter.
  const digits = gutterDigits(first, lines.length);
  gutter.parentElement?.style.setProperty('--de-code-gutter-digits', String(digits));
}
