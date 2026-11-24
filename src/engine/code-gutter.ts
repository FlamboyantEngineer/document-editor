// A code block's gutter of line numbers: one line per line of code, its number, then a hidden copy
// of the line's text that wraps as the code does, so a wrapped line's later rows stay blank. On
// forced lines (DOCE-PAGINATION-11.2) the copy breaks where the engine's lines wrap the code.

import type { Decoration } from 'prosemirror-view';
import type { LineTable } from '../layout-engine/line-table.js';

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

// Each line of a code text, as the pieces the lines it is drawn on wrap it into: one piece each
// when the browser chooses its lines.
function rowsOf(text: string, table: LineTable | null): string[][] {
  const lines = text.split('\n');
  if (!table) return lines.map((line) => [line]);
  const wraps = wrapsOf(text, table);
  let start = 0;
  return lines.map((line) => {
    const pieces = [''];
    for (let index = 0; index < line.length; index += 1) {
      if (index > 0 && wraps.has(start + index)) pieces.push('');
      pieces[pieces.length - 1] += line.charAt(index);
    }
    start += line.length + 1;
    return pieces;
  });
}

// What each gutter line was drawn from: its number, whether on forced lines, and its pieces.
const drawnRows = new WeakMap<Element, string>();

// A gutter line: its number, then the hidden copy of its line of code, a break between its pieces.
function gutterLine(
  owner: Document,
  line: { number: string; pieces: readonly string[]; forced: boolean },
) {
  const { number, pieces, forced } = line;
  const row = owner.createElement('span');
  row.className = 'de-code-gutter__line';
  row.dataset.lineNumber = number;
  if (forced) row.dataset.engineLines = 'true';
  const label = owner.createElement('span');
  label.className = 'de-code-gutter__number';
  label.textContent = number;
  const copy = owner.createElement('span');
  copy.className = 'de-code-gutter__text';
  pieces.forEach((piece, index) => {
    if (index > 0) copy.append(owner.createElement('br'));
    copy.append(piece);
  });
  row.append(label, copy);
  return row;
}

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
  const lines = rowsOf(text, at.lines);
  const kept = [...gutter.children];
  lines.forEach((pieces, index) => {
    const number = String(first + index);
    const key = `${number}|${String(forced)}|${pieces.join('\n')}`;
    const existing = kept[index];
    if (existing && drawnRows.get(existing) === key) return;
    const row = gutterLine(owner, { number, pieces, forced });
    drawnRows.set(row, key);
    if (existing) existing.replaceWith(row);
    else gutter.appendChild(row);
  });
  for (const extra of kept.slice(lines.length)) extra.remove();
  // The digits of the highest number, at least three, from which the stylesheet sizes the gutter.
  const digits = Math.max(3, String(first + lines.length - 1).length);
  gutter.parentElement?.style.setProperty('--de-code-gutter-digits', String(digits));
}
