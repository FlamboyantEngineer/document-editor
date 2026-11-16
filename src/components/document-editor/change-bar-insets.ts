// Measures how far each barred block sits inside its page's content box, so the reference sheet can
// place every bar, a block's own or its lines', in one column at the template's offset from the
// content, whatever the block's indent or nesting (DOCE-VERSIONS-2.4).

import type { EditorView } from 'prosemirror-view';
import type { ChangeInset, ChangeInsets } from '../../engine/index.js';

// What carries a block's own bar: its kind of change, or blocks deleted beside it.
const BARRED = '[data-diff-change], [data-diff-deletion]';

// The box a block's bars keep their column against: its page's content, or the editor's content.
function contentBoxOf(view: EditorView, block: HTMLElement): DOMRect {
  const content = block.closest('.pm-page-content') ?? view.dom;
  return content.getBoundingClientRect();
}

function insetOf(view: EditorView, block: HTMLElement, scale: number): ChangeInset {
  const box = block.getBoundingClientRect();
  const content = contentBoxOf(view, block);
  return { left: (box.left - content.left) / scale, right: (content.right - box.right) / scale };
}

// The position of the node a block draws: before its content, or, for a leaf, where it is.
function positionOf(view: EditorView, block: HTMLElement): number | null {
  const inside = view.posAtDOM(block, 0);
  for (const pos of [inside - 1, inside]) {
    if (pos >= 0 && view.nodeDOM(pos) === block) return pos;
  }
  return null;
}

/**
 * The insets of the blocks that carry a bar of their own and of the `lined` blocks, whose lines
 * carry bars, by position, unscaled by the zoom `scale`.
 */
export function measureChangeInsets(
  view: EditorView,
  { scale, lined }: { readonly scale: number; readonly lined: ReadonlyMap<number, HTMLElement> },
): ChangeInsets {
  const insets = new Map<number, ChangeInset>();
  for (const [pos, block] of lined) insets.set(pos, insetOf(view, block, scale));
  const { doc } = view.state;
  for (const block of view.dom.querySelectorAll<HTMLElement>(BARRED)) {
    if (!block.isConnected || block.closest('.de-change-lines')) continue;
    const pos = positionOf(view, block);
    const node = pos === null ? null : doc.nodeAt(pos);
    if (pos !== null && node && !node.isInline && !insets.has(pos)) {
      insets.set(pos, insetOf(view, block, scale));
    }
  }
  return insets;
}
