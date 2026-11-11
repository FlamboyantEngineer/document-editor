// Where each annotation's anchor is drawn: the line boxes of the elements that mark it in the
// document, in the annotation layer's content coordinates.

import type { AnnotationRect } from '@flamboyantengineer/ui-components/annotation-layer';

/** How an annotation's anchor is found in the document. */
export type AnchorTarget =
  | { readonly kind: 'comment'; readonly id: string }
  | { readonly kind: 'suggestion'; readonly id: string }
  | { readonly kind: 'selection' };

function selectorOf(target: AnchorTarget): string | null {
  if (target.kind === 'selection') return null;
  const id = CSS.escape(target.id);
  return target.kind === 'comment'
    ? `mark[data-comment-id="${id}"]`
    : `ins[data-id="${id}"], del[data-id="${id}"], [data-suggestion-split-id="${id}"]`;
}

// The element an anchor starts in: its first marking element, else the selection's start.
function anchorElement(layer: HTMLElement, target: AnchorTarget): Element | null {
  const selector = selectorOf(target);
  if (selector) return layer.querySelector(selector);
  const selection = layer.ownerDocument.getSelection();
  if (!selection?.rangeCount) return null;
  const { startContainer } = selection.getRangeAt(0);
  if (!layer.contains(startContainer)) return null;
  return startContainer.nodeType === 1 ? (startContainer as Element) : startContainer.parentElement;
}

/** The space between a page's edge and the cards beside it, in pixels. */
export const CARD_GAP = 16;

/**
 * How far each card moves across from the margin's start to sit beside the page its anchor is on,
 * `CARD_GAP` pixels from the page's end edge, by annotation key: pages of another size or
 * orientation have their own edge. A card whose anchor is on no page does not move.
 */
export function measureCardOffsets(
  layer: HTMLElement,
  margin: Element | null,
  targets: ReadonlyMap<string, AnchorTarget>,
): Map<string, number> {
  const offsets = new Map<string, number>();
  if (!margin) return offsets;
  // The layer's own scale, when an ancestor scales it: the card moves in the layer's pixels.
  const scale = layer.offsetWidth ? layer.getBoundingClientRect().width / layer.offsetWidth : 1;
  const start = margin.getBoundingClientRect().left;
  for (const [key, target] of targets) {
    const page = anchorElement(layer, target)?.closest('.pm-page');
    if (!page) continue;
    offsets.set(
      key,
      Math.round((page.getBoundingClientRect().right - start) / (scale || 1)) + CARD_GAP,
    );
  }
  return offsets;
}

/** Whether two sets of card offsets are the same. */
export function isSameOffsets(
  a: ReadonlyMap<string, number>,
  b: ReadonlyMap<string, number>,
): boolean {
  return a.size === b.size && [...a].every(([key, offset]) => b.get(key) === offset);
}

// The start of the selection inside the layer, as a line-high rectangle with no width.
function selectionBoxes(layer: HTMLElement): DOMRect[] {
  const selection = layer.ownerDocument.getSelection();
  if (!selection?.rangeCount) return [];
  const range = selection.getRangeAt(0);
  if (range.collapsed || !layer.contains(range.startContainer)) return [];
  const [first] = range.getClientRects();
  return first ? [new DOMRect(first.left, first.top, 0, first.height)] : [];
}

/** Measures each target's anchor inside a layer, by annotation key; a missing anchor has none. */
export function measureAnchors(
  layer: HTMLElement,
  targets: ReadonlyMap<string, AnchorTarget>,
): Map<string, AnnotationRect[]> {
  const frame = layer.getBoundingClientRect();
  const left = frame.left + layer.clientLeft - layer.scrollLeft;
  const top = frame.top + layer.clientTop - layer.scrollTop;
  const measured = new Map<string, AnnotationRect[]>();
  for (const [key, target] of targets) {
    const selector = selectorOf(target);
    const boxes = selector
      ? [...layer.querySelectorAll(selector)].flatMap((element) => [...element.getClientRects()])
      : selectionBoxes(layer);
    measured.set(
      key,
      boxes.map((box) => ({
        top: box.top - top,
        left: box.left - left,
        width: box.width,
        height: box.height,
      })),
    );
  }
  return measured;
}

/** Whether two measurements hold the same rectangles. */
export function isSameMeasurement(
  a: ReadonlyMap<string, readonly AnnotationRect[]>,
  b: ReadonlyMap<string, readonly AnnotationRect[]>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [key, rects] of a) {
    const other = b.get(key);
    if (!other || other.length !== rects.length) return false;
    const same = rects.every(
      (rect, index) =>
        rect.top === other[index]?.top &&
        rect.left === other[index].left &&
        rect.width === other[index].width &&
        rect.height === other[index].height,
    );
    if (!same) return false;
  }
  return true;
}
