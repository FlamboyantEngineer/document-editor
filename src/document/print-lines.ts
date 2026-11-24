// A text block drawn on its computed lines without a view (DOCE-PAGINATION-13.3): its content cut
// at its line marks' edges, each cut wrapped in the hooks of the marks that cover it, inside its
// own marks, as the pages' view draws the same marks as inline decorations.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { LabelPart, LineMark } from '../layout-engine/line-marks.js';
import {
  isPrintElement,
  markedContent,
  type MarkedTrees,
  type NodeDrawing,
  nodeTree,
  printElement,
  type PrintTree,
} from './print-tree.js';

// The hooks of the marks covering a range, merged as a view merges decorations on one node; an
// inner mark is left to `inInnerMarks`, except on an inline node's own element (`boxes`).
function hooksOver(
  marks: readonly LineMark[],
  { from, to }: { from: number; to: number },
  boxes = false,
) {
  const covering = marks.filter(
    (mark) => (boxes || !mark.inner) && mark.from <= from && mark.to >= to,
  );
  if (!covering.length) return null;
  const styles = covering.flatMap((mark) => (mark.style ? [mark.style] : []));
  // Written as a view writes an element's style, each declaration ended.
  const style = styles.map((declaration) => `${declaration};`).join(' ');
  return { class: covering.map((mark) => mark.class).join(' '), style };
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
  const attrs: Record<string, string> = { class: hooks.class };
  if (hooks.style) attrs.style = hooks.style;
  return [printElement('span', attrs, trees)];
}

// A piece wrapped in a span of each inner mark covering it, as the view nests them.
function inInnerMarks(
  trees: PrintTree[],
  marks: readonly LineMark[],
  { from, to }: { from: number; to: number },
) {
  return marks
    .filter((mark) => mark.inner && mark.from <= from && mark.to >= to)
    .reduceRight<PrintTree[]>((inner, mark) => {
      const attrs: Record<string, string> = { class: mark.class };
      if (mark.style) attrs.style = `${mark.style};`;
      return [printElement('span', attrs, inner)];
    }, trees);
}

// A text node cut at the marks' edges inside it, each piece in the hooks covering it.
function textPieces(text: string, at: number, marks: readonly LineMark[]): PrintTree[] {
  const edges = new Set([at, at + text.length]);
  for (const mark of marks) {
    for (const edge of [mark.from, mark.to])
      if (edge > at && edge < at + text.length) edges.add(edge);
  }
  const sorted = [...edges].sort((a, b) => a - b);
  return sorted.slice(1).flatMap((to, index) => {
    const from = sorted[index] ?? at;
    const pieces = inInnerMarks([{ text: text.slice(from - at, to - at) }], marks, { from, to });
    const hooks = hooksOver(marks, { from, to });
    if (!hooks) return pieces;
    const attrs: Record<string, string> = { class: hooks.class };
    if (hooks.style) attrs.style = hooks.style;
    return [printElement('span', attrs, pieces)];
  });
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
  block.forEach((child, offset) => {
    if (child.isText) {
      items.push({ marks: child.marks, trees: textPieces(child.text ?? '', offset, marks) });
      return;
    }
    const at = place.pos + 1 + offset;
    const drawn = nodeTree(child, place.drawing, { at, unmarked: true });
    // A box on the node, such as a page variable's, is drawn on its own element with the other
    // marks on its range, as the view draws them.
    const hooks = hooksOver(marks, { from: offset, to: offset + child.nodeSize }, true);
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
}

/**
 * A caption's label on the lines its parts start (`de-forced-lines__label`), each part after the
 * first at its line's indent and each line it ends broken, and the text a later part's caption
 * shows on its lines (`de-forced-lines__text`): what the pages draw for a caption, before its
 * content, in place of the label and text the stylesheet draws.
 */
export function shownTrees({ label, text }: ShownText): PrintTree[] {
  const trees: PrintTree[] = [];
  if (label) {
    const parts = label.flatMap((part, index): PrintTree[] => {
      const own: PrintTree =
        index > 0 && part.style
          ? printElement('span', { class: 'de-forced-lines__start', style: `${part.style};` }, [
              { text: part.text },
            ])
          : { text: part.text };
      return part.breaks ? [own, printElement('br')] : [own];
    });
    trees.push(printElement('span', { class: 'de-forced-lines__label' }, parts));
  }
  if (text) {
    const pieces = textPieces(text.text, 0, text.marks);
    trees.push(printElement('span', { class: 'de-forced-lines__text' }, pieces));
  }
  return trees;
}
