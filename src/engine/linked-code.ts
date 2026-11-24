// Linked code's text, which its view draws from the block's attributes: its tokens as elements
// marked for the stylesheet, and, on forced lines (DOCE-PAGINATION-11.2), inside the hooks that
// draw it on the lines the engine laid its code out on, as a code block's line marks draw its own.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { linkedCodeFigure } from '../layout-engine/blocks/linked-code.js';
import { type LineMark, lineMarks } from '../layout-engine/line-marks.js';
import type { LineTable } from '../layout-engine/line-table.js';
import { codeTokenAttrs, highlightCode } from './code-highlighting.js';

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

function runsOf(text: string, kinds: ReturnType<typeof highlightCode>, marks: LineMark[]): Run[] {
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

// The elements of runs that share their marks from a level in: each mark at that level one element
// around the runs it covers, a run inside no more marks its token's element or its text.
function drawRuns(owner: Document, text: string, at: { runs: Run[]; level: number }): Node[] {
  const { runs, level } = at;
  const nodes: Node[] = [];
  for (let index = 0; index < runs.length;) {
    const run = runs[index] as Run;
    const mark = run.marks[level];
    if (!mark) {
      nodes.push(tokenNode(owner, text.slice(run.from, run.to), run.kind));
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < runs.length && runs[end]?.marks[level] === mark) end += 1;
    const element = owner.createElement('span');
    element.className = mark.class;
    if (mark.style) element.setAttribute('style', mark.style);
    element.append(...drawRuns(owner, text, { runs: runs.slice(index, end), level: level + 1 }));
    nodes.push(element);
    index = end;
  }
  return nodes;
}

function tokenNode(owner: Document, text: string, kind: string | undefined): Node {
  if (kind === undefined) return owner.createTextNode(text);
  const span = owner.createElement('span');
  for (const [name, value] of Object.entries(codeTokenAttrs(kind))) span.setAttribute(name, value);
  span.textContent = text;
  return span;
}

/**
 * Draws linked code's text in its code element as its tokens, each kind marked for the stylesheet;
 * on the lines given, inside the line marks of the code it is laid out as (`lineMarks`), so each
 * line the engine wraps ends at its last character and a reserved cluster takes its box.
 */
export function drawLinkedCode(
  code: HTMLElement,
  node: ProseMirrorNode,
  lines: LineTable | null,
): void {
  const text = String(node.attrs.code ?? '');
  const laid = lines ? linkedCodeFigure(node)?.code : undefined;
  const marks = laid && lines ? lineMarks(laid, { ...lines, justify: false }) : [];
  const runs = runsOf(
    text,
    highlightCode(text, node.attrs.language),
    marks.filter(({ from, to }) => to > from),
  );
  code.replaceChildren(...drawRuns(code.ownerDocument, text, { runs, level: 0 }));
}
