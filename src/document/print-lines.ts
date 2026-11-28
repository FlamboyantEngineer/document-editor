// A text block drawn on its computed lines without a view (DOCE-PAGINATION-13.3): its content cut
// at its line marks' edges, each cut wrapped in the hooks of the marks that cover it, inside its
// own marks, as the pages' view draws the same marks as inline decorations.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { LabelPart, LineMark } from '../layout-engine/line-marks.js';
import { variablePieces } from '../layout-engine/variable-pieces.js';
import {
  isPrintElement,
  markedContent,
  type MarkedTrees,
  type NodeDrawing,
  nodeTree,
  printElement,
  type PrintTree,
} from './print-tree.js';

// The hooks of covering marks, merged as a view merges decorations on one node.
function hooksOf(marks: readonly LineMark[]) {
  if (!marks.length) return null;
  const styles = marks.flatMap((mark) => (mark.style ? [mark.style] : []));
  // Written as a view writes an element's style, each declaration ended.
  const style = styles.map((declaration) => `${declaration};`).join(' ');
  return { class: marks.map((mark) => mark.class).join(' '), style };
}

function inHooks(trees: PrintTree[], hooks: { class: string; style: string }): PrintTree[] {
  const attrs: Record<string, string> = { class: hooks.class };
  if (hooks.style) attrs.style = hooks.style;
  return [printElement('span', attrs, trees)];
}

// Adds hooks to a drawn inline node's own element, or wraps it in a span when it has none.
function withHooks(trees: PrintTree[], hooks: { class: string; style: string }): PrintTree[] {
  const [first] = trees;
  if (trees.length === 1 && first && isPrintElement(first)) {
    const own = first.attrs.get('class');
    first.attrs.set('class', own ? `${own} ${hooks.class}` : hooks.class);
    if (hooks.style) {
      const style = first.attrs.get('style');
      first.attrs.set(
        'style',
        style ? `${style.replace(/;?\s*$/u, ';')} ${hooks.style}` : hooks.style,
      );
    }
    return trees;
  }
  return inHooks(trees, hooks);
}

// A piece wrapped in a span of each inner mark covering it, as the view nests them.
function inInnerMarks(trees: PrintTree[], marks: readonly LineMark[]) {
  return marks.reduceRight<PrintTree[]>((inner, mark) => {
    if (!mark.inner) return inner;
    return inHooks(inner, { class: mark.class, style: mark.style ? `${mark.style};` : '' });
  }, trees);
}

// Line marks are already in drawing order, by starting offset. Scan them once across the block,
// retaining only marks that can still reach the next content offset.
function scanMarks(marks: readonly LineMark[]) {
  let index = 0;
  let active: LineMark[] = [];
  return (from: number) => {
    active = active.filter((mark) => mark.to > from);
    let next = marks[index];
    while (next && next.from <= from) {
      if (next.to > from) active.push(next);
      index += 1;
      next = marks[index];
    }
    return { active, next: next?.from ?? Infinity };
  };
}

// A text node cut at the marks' edges inside it, each piece in the hooks covering it.
function textPieces(text: string, at: number, scan: ReturnType<typeof scanMarks>): PrintTree[] {
  const pieces: PrintTree[] = [];
  const end = at + text.length;
  for (let from = at; from < end;) {
    const { active, next } = scan(from);
    let to = Math.min(end, next);
    for (const mark of active) to = Math.min(to, mark.to);
    const inner = inInnerMarks([{ text: text.slice(from - at, to - at) }], active);
    const hooks = hooksOf(active.filter((mark) => !mark.inner));
    pieces.push(...(hooks ? inHooks(inner, hooks) : inner));
    from = to;
  }
  return pieces;
}

/**
 * A text block's content drawn on its lines: its inline content in its marks, cut where the line
 * marks start and end, with each mark's hooks on the content it covers.
 */
export function linesContent(
  block: ProseMirrorNode,
  marks: readonly LineMark[],
  place: { readonly pos: number; readonly drawing: NodeDrawing },
): PrintTree[] {
  const items: MarkedTrees[] = [];
  const scan = scanMarks(marks);
  block.forEach((child, offset) => {
    if (child.isText) {
      items.push({ marks: child.marks, trees: textPieces(child.text ?? '', offset, scan) });
      return;
    }
    const at = place.pos + 1 + offset;
    const drawn = nodeTree(child, place.drawing, { at, unmarked: true });
    // A box on the node, such as a page variable's, is drawn on its own element with the other
    // marks on its range, as the view draws them.
    const hooks = hooksOf(scan(offset).active.filter((mark) => mark.to >= offset + child.nodeSize));
    items.push({ marks: child.marks, trees: hooks ? withHooks(drawn, hooks) : drawn });
  });
  return markedContent(items);
}

/** What a caption draws on its lines that is not its content (DOCE-PAGINATION-11.2). */
interface ShownText {
  /** Its label's parts, where a line breaks inside the label or right after it. */
  readonly label?: readonly LabelPart[] | null | undefined;
  /** The text a later part's caption shows, with the marks that draw it on its lines. */
  readonly text?: { readonly text: string; readonly marks: readonly LineMark[] } | undefined;
  /** Whether the label is drawn and not read, as a heading's number is: its name is its text. */
  readonly unread?: boolean | undefined;
}

// A label's part as its text, each cluster of a reserved width in its box (DOCE-PAGINATION-12.4).
function partTrees({ text, reserved = [] }: LabelPart): PrintTree[] {
  const trees: PrintTree[] = [];
  let at = 0;
  for (const box of reserved) {
    if (box.from > at) trees.push({ text: text.slice(at, box.from) });
    const style = `--de-reserved-width: ${box.width.toFixed(3)}px;`;
    const cluster = { text: text.slice(box.from, box.to) };
    trees.push(printElement('span', { class: 'de-forced-lines__reserved', style }, [cluster]));
    at = box.to;
  }
  if (at < text.length || !trees.length) trees.push({ text: text.slice(at) });
  return trees;
}

/**
 * A caption's label on the lines its parts start (`de-forced-lines__label`), each part after the
 * first at its line's indent and each line it ends broken, and the text a later part's caption
 * shows on its lines (`de-forced-lines__text`): what the pages draw for a caption, before its
 * content, in place of the label and text the stylesheet draws, and for a heading whose number
 * holds a cluster of a reserved width, its number (DOCE-PAGINATION-12.4).
 */
export function shownTrees({ label, text, unread = false }: ShownText): PrintTree[] {
  const trees: PrintTree[] = [];
  if (label) {
    const parts = label.flatMap((part, index): PrintTree[] => {
      const text = partTrees(part);
      const own: PrintTree[] =
        index > 0 && part.style
          ? [
              printElement(
                'span',
                { class: 'de-forced-lines__start', style: `${part.style};` },
                text,
              ),
            ]
          : text;
      return part.breaks ? [...own, printElement('br')] : own;
    });
    const attrs: Record<string, string> = unread ? { 'aria-hidden': 'true' } : {};
    trees.push(printElement('span', { class: 'de-forced-lines__label', ...attrs }, parts));
  }
  if (text) {
    const pieces = textPieces(text.text, 0, scanMarks(text.marks));
    trees.push(printElement('span', { class: 'de-forced-lines__text' }, pieces));
  }
  return trees;
}

/** Where the forced lines break inside each variable's value: their marks, by position inside it. */
export function valueBreaks(
  blocks: readonly { readonly pos: number; readonly marks: readonly LineMark[] }[],
): ReadonlyMap<number, readonly LineMark[]> {
  const found = new Map<number, LineMark[]>();
  for (const block of blocks)
    for (const mark of block.marks) {
      if (mark.side === undefined) continue;
      const at = block.pos + 1 + mark.from;
      found.set(at, [...(found.get(at) ?? []), mark]);
    }
  return found;
}

/**
 * A variable's value as the pages draw it inside the variable (DOCE-PAGINATION-9.5): word by word,
 * each word an element of its own, with each break or indent the forced lines draw among them
 * (`valueBreaks`) before the word whose side it precedes.
 */
export function valueTrees(value: string, breaks: readonly LineMark[] = []): PrintTree[] {
  return variablePieces(value).flatMap((piece) => {
    const before = breaks
      .filter((mark) => mark.side === piece.side - 1)
      .map((mark) =>
        printElement('span', { class: mark.class, ...(mark.style ? { style: mark.style } : {}) }),
      );
    return [...before, printElement('span', {}, [{ text: piece.text }])];
  });
}
