// What code is drawn as, as plain data that the editor's views and a static drawing of a layout
// (the viewer, a print) both build their elements from, so all of them draw code alike: its text as
// its highlighted tokens inside the hooks that put it on its lines (DOCE-PAGINATION-11.2), and its
// gutter of line numbers, one line per line of code, which breaks where the code's lines wrap it.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { LineMark } from '../layout-engine/line-marks.js';
import { codeTokenAttrs, highlightCode } from './code-highlighting.js';

/** An element of drawn code, or its text. */
export type CodeTree =
  | string
  | {
      readonly tag: string;
      readonly attrs: Readonly<Record<string, string>>;
      readonly children: readonly CodeTree[];
    };

const element = (
  tag: string,
  attrs: Readonly<Record<string, string>>,
  children: readonly CodeTree[] = [],
): CodeTree => ({ tag, attrs, children });

// A run of the text with one token kind, inside the same marks: the outer ones first.
interface Run {
  readonly from: number;
  readonly to: number;
  readonly kind: string | undefined;
  readonly marks: readonly LineMark[];
}

// Outer marks before inner ones, a wider one before one inside it.
const byNesting = (a: LineMark, b: LineMark) =>
  Number(!!a.inner) - Number(!!b.inner) || a.from - b.from || b.to - a.to;

function runsOf(
  text: string,
  kinds: readonly { from: number; to: number; kind: string }[],
  marks: readonly LineMark[],
): Run[] {
  const edges = new Set([0, text.length]);
  for (const { from, to } of [...kinds, ...marks]) edges.add(from).add(to);
  const sorted = [...edges].filter((at) => at <= text.length).sort((a, b) => a - b);
  const runs: Run[] = [];
  sorted.slice(1).forEach((to, index) => {
    const from = sorted[index] ?? 0;
    if (to <= from) return;
    const kind = kinds.find((token) => token.from <= from && token.to >= to)?.kind;
    const covering = marks.filter((mark) => mark.from <= from && mark.to >= to).sort(byNesting);
    runs.push({ from, to, kind, marks: covering });
  });
  return runs;
}

const tokenTree = (text: string, kind: string | undefined): CodeTree =>
  kind === undefined ? text : element('span', codeTokenAttrs(kind), [text]);

// The trees of runs that share their marks from a level in: each mark at that level one element
// around the runs it covers, a run inside no more marks its token's element or its text.
function drawRuns(text: string, runs: readonly Run[], level: number): CodeTree[] {
  const trees: CodeTree[] = [];
  for (let index = 0; index < runs.length;) {
    const run = runs[index] as Run;
    const mark = run.marks[level];
    if (!mark) {
      trees.push(tokenTree(text.slice(run.from, run.to), run.kind));
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < runs.length && runs[end]?.marks[level] === mark) end += 1;
    const attrs: Record<string, string> = { class: mark.class };
    if (mark.style) attrs.style = mark.style;
    trees.push(element('span', attrs, drawRuns(text, runs.slice(index, end), level + 1)));
    index = end;
  }
  return trees;
}

/**
 * Code's text as its tokens in its language, each kind marked for the stylesheet, inside the line
 * marks given (`lineMarks`, by offset in the text): each line the engine wraps ends at its last
 * character, and a reserved cluster takes its box.
 */
export function codeTrees(
  text: string,
  language: unknown,
  marks: readonly LineMark[] = [],
): CodeTree[] {
  const ranged = marks.filter(({ from, to }) => to > from);
  return drawRuns(text, runsOf(text, highlightCode(text, language), ranged), 0);
}

/**
 * Each line of a code text as the pieces the lines it is drawn on wrap it into, given the offsets
 * where they wrap it; one piece each when the browser chooses its lines (`null`).
 */
export function gutterRows(text: string, wraps: ReadonlySet<number> | null): string[][] {
  const lines = text.split('\n');
  if (!wraps) return lines.map((line) => [line]);
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

/** Where the line marks of a code text wrap it: the end of each line that ends with an end mark. */
export const wrapsOfMarks = (marks: readonly LineMark[]): ReadonlySet<number> =>
  new Set(marks.filter((mark) => /\bde-forced-lines__end\b/u.test(mark.class)).map(({ to }) => to));

/**
 * A gutter line: its number, then the hidden copy of its line of code, a break between the pieces
 * its lines wrap it into; on forced lines marked `data-engine-lines`.
 */
export function gutterLine(line: {
  readonly number: string;
  readonly pieces: readonly string[];
  readonly forced: boolean;
}): CodeTree {
  const attrs: Record<string, string> = {
    class: 'de-code-gutter__line',
    'data-line-number': line.number,
  };
  if (line.forced) attrs['data-engine-lines'] = 'true';
  const copy = line.pieces.flatMap((piece, index): CodeTree[] =>
    index > 0 ? [element('br', {}), piece] : [piece],
  );
  return element('span', attrs, [
    element('span', { class: 'de-code-gutter__number' }, [line.number]),
    element('span', { class: 'de-code-gutter__text' }, copy),
  ]);
}

const linked = (node: ProseMirrorNode) => node.type.name === 'linked_code_block';

/** The number of a code block's or linked code's first line, 1 unless it names a later one. */
export function firstCodeLine(node: ProseMirrorNode): number {
  const value = Number(linked(node) ? node.attrs.startLine : node.attrs.codeLineStart);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

/**
 * Whether code's first line goes on with the line the part before it ends: a later part of code
 * split inside a line longer than a page (DOCE-PAGINATION-3.3), whose first gutter row is blank.
 */
export const continuesCodeLine = (node: ProseMirrorNode): boolean =>
  node.attrs.codeLineContinued === true;

/** A gutter row's number: blank for the first row of code that goes on with an earlier line. */
export const gutterNumber = (first: number, index: number, continued: boolean): string =>
  continued && index === 0 ? '' : String(first + index);

/**
 * The code a gutter numbers. Linked code's text is drawn as it is, so a line feed at its end starts
 * no line, where a code block's view draws the line after it.
 */
export const gutterText = (node: ProseMirrorNode): string =>
  linked(node) ? String(node.attrs.code ?? '').replace(/\n$/u, '') : node.textContent;

/** The digits a gutter is wide for: those of its highest number, at least three. */
export const gutterDigits = (first: number, rows: number): number =>
  Math.max(3, String(first + rows - 1).length);

/** The gutter element, drawn beside the code and hidden from assistive technology. */
const GUTTER_ATTRS: Readonly<Record<string, string>> = {
  class: 'de-code-gutter',
  'aria-hidden': 'true',
  contenteditable: 'false',
};

/**
 * A code text's whole gutter, numbered from its first line, broken where the line marks given wrap
 * its lines; on the browser's lines without them (`null`).
 */
export function gutterTree(
  text: string,
  at: {
    readonly first: number;
    readonly wraps: ReadonlySet<number> | null;
    readonly continued?: boolean | undefined;
  },
): CodeTree {
  const forced = at.wraps !== null;
  const rows = gutterRows(text, at.wraps).map((pieces, index) =>
    gutterLine({ number: gutterNumber(at.first, index, at.continued === true), pieces, forced }),
  );
  return element('span', GUTTER_ATTRS, rows);
}

/** A tree as elements of a document. */
export function codeElements(owner: Document, trees: readonly CodeTree[]): Node[] {
  return trees.map((tree) => {
    if (typeof tree === 'string') return owner.createTextNode(tree);
    const made = owner.createElement(tree.tag);
    for (const [name, value] of Object.entries(tree.attrs)) made.setAttribute(name, value);
    made.append(...codeElements(owner, tree.children));
    return made;
  });
}
