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
