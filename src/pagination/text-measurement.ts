import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import type { TextMeasure, TextMeasurement } from '../model/index.js';
import { elementOf } from './block-elements.js';
import { measureCanvasText } from './canvas-text-measure.js';

interface Measuring {
  readonly view: EditorView;
  readonly scale: number;
  readonly placement: { pos: number };
  readonly textMeasurement?: 'dom' | 'canvas' | undefined;
}

interface Placed {
  readonly node: ProseMirrorNode;
  readonly relative: number;
}

// The distinct lines a range's boxes sit on.
function countLines(rects: Iterable<DOMRect>): number {
  const tops = new Set<number>();
  for (const rect of rects) {
    if (rect.height > 0.5 && rect.width > 0.5) tops.add(Math.round(rect.top));
  }
  return tops.size;
}

function measureRange(range: Range, scale: number): TextMeasure {
  return {
    height: range.getBoundingClientRect().height / scale,
    lines: countLines(range.getClientRects()),
  };
}

// A text block's text, by content offset, through the view's positions. `relative` is where the
// text block sits from the measured block's start.
export function measureTextContent(
  measuring: Measuring,
  { node, relative }: Placed,
): TextMeasurement {
  const { view, scale, placement } = measuring;
  let fast: TextMeasurement | null | undefined;
  return {
    offset: 0,
    measure: (from, to) => {
      const pos = placement.pos + relative;
      if (fast === undefined) {
        const element = elementOf(view, pos);
        fast =
          measuring.textMeasurement === 'canvas' && element
            ? measureCanvasText(element, node, scale)
            : null;
      }
      if (fast) return fast.measure(from, to);
      const start = view.domAtPos(pos + 1 + from);
      const end = view.domAtPos(pos + 1 + to);
      const range = view.dom.ownerDocument.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      return measureRange(range, scale);
    },
  };
}

// The text node and offset a character of an element's text falls at.
function textPoint(element: Element, index: number): { node: Node; offset: number } {
  const walker = element.ownerDocument.createTreeWalker(element, 4);
  let remaining = index;
  let last: Node = element;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.nodeValue?.length ?? 0;
    if (remaining <= length) return { node, offset: remaining };
    remaining -= length;
    last = node;
  }
  return { node: last, offset: last.nodeValue?.length ?? 0 };
}

// Linked code's code, by character, through the element that renders it.
export function measureCodeContent(measuring: Measuring, relative: number): TextMeasurement | null {
  const codeAt = () =>
    elementOf(measuring.view, measuring.placement.pos + relative)?.querySelector('code');
  const first = codeAt();
  if (!first) return null;
  return {
    offset: 0,
    measure: (from, to) => {
      const code = codeAt() ?? first;
      const start = textPoint(code, from);
      const end = textPoint(code, to);
      const range = code.ownerDocument.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      return measureRange(range, measuring.scale);
    },
  };
}
