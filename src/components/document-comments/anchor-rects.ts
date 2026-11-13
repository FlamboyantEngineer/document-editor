// Where each annotation's anchor is drawn: the line boxes of the elements that mark it in the
// document, in the annotation layer's content coordinates.

import type { AnnotationRect } from '@flamboyantengineer/ui-components/annotation-layer';

/** How an annotation's anchor is found in the document. */
export type AnchorTarget =
  | { readonly kind: 'comment'; readonly id: string }
  | { readonly kind: 'suggestion'; readonly id: string }
  | { readonly kind: 'selection' };

// The elements that mark each comment and suggestion in a layer, found in one pass over it rather
// than one query per annotation, so a document with many threads is measured in one walk.
interface Marking {
  readonly comment: ReadonlyMap<string, Element[]>;
  readonly suggestion: ReadonlyMap<string, Element[]>;
}

function group(
  found: Map<string, Element[]>,
  { elements, name }: { readonly elements: Iterable<Element>; readonly name: string },
) {
  for (const element of elements) {
    const id = element.getAttribute(name);
    if (!id) continue;
    const known = found.get(id);
    if (known) known.push(element);
    else found.set(id, [element]);
  }
  return found;
}

function markingOf(layer: HTMLElement): Marking {
  return {
    comment: group(new Map(), {
      elements: layer.querySelectorAll('mark[data-comment-id]'),
      name: 'data-comment-id',
    }),
    suggestion: group(
      group(new Map(), {
        elements: layer.querySelectorAll('ins[data-id], del[data-id]'),
        name: 'data-id',
      }),
      {
        elements: layer.querySelectorAll('[data-suggestion-split-id]'),
        name: 'data-suggestion-split-id',
      },
    ),
  };
}

const elementsOf = (marking: Marking, target: AnchorTarget): readonly Element[] =>
  target.kind === 'selection' ? [] : (marking[target.kind].get(target.id) ?? []);

// The element an anchor starts in: its first marking element, else the selection's start.
function anchorElement(layer: HTMLElement, marking: Marking, target: AnchorTarget): Element | null {
  if (target.kind !== 'selection') return elementsOf(marking, target)[0] ?? null;
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
// The class of the margin of cards, a child of the annotation layer.
const MARGIN_CLASS = 'de-document-comments__margin';

function measureCardOffsets(
  layer: HTMLElement,
  targets: ReadonlyMap<string, AnchorTarget>,
  marking: Marking,
): Map<string, number> {
  const offsets = new Map<string, number>();
  const margin = layer.querySelector(`:scope > .${MARGIN_CLASS}`);
  if (!margin) return offsets;
  // The layer's own scale, when an ancestor scales it: the card moves in the layer's pixels.
  const scale = layer.offsetWidth ? layer.getBoundingClientRect().width / layer.offsetWidth : 1;
  const start = margin.getBoundingClientRect().left;
  for (const [key, target] of targets) {
    const page = anchorElement(layer, marking, target)?.closest('.pm-page');
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

/**
 * Measures each target's anchor inside a layer, by annotation key; a missing anchor has none. The
 * marking elements are found in one pass over the layer, however many targets there are.
 */
function measureAnchors(
  layer: HTMLElement,
  targets: ReadonlyMap<string, AnchorTarget>,
  marking: Marking,
): Map<string, AnnotationRect[]> {
  const frame = layer.getBoundingClientRect();
  const left = frame.left + layer.clientLeft - layer.scrollLeft;
  const top = frame.top + layer.clientTop - layer.scrollTop;
  const measured = new Map<string, AnnotationRect[]>();
  for (const [key, target] of targets) {
    const boxes =
      target.kind === 'selection'
        ? selectionBoxes(layer)
        : elementsOf(marking, target).flatMap((element) => [...element.getClientRects()]);
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

/** What one pass measures in a layer: each anchor's rectangles and each card's offset. */
export interface LayerMeasurement {
  readonly rects: ReadonlyMap<string, readonly AnnotationRect[]>;
  readonly offsets: ReadonlyMap<string, number>;
}

/**
 * Measures each target's anchor inside a layer, and how far its card moves across to sit beside
 * the anchor's page (`CARD_GAP` from its end edge), by annotation key; a missing anchor has no
 * rectangles and its card does not move. The marking elements are found in one pass over the
 * layer, however many targets there are.
 */
export function measureLayer(
  layer: HTMLElement,
  targets: ReadonlyMap<string, AnchorTarget>,
): LayerMeasurement {
  const marking = markingOf(layer);
  return {
    rects: measureAnchors(layer, targets, marking),
    offsets: measureCardOffsets(layer, targets, marking),
  };
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
