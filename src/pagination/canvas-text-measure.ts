import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { TextMeasurement } from '../model/index.js';

const contexts = new WeakMap<Document, CanvasRenderingContext2D | null>();
const roundingTolerance = 0.125;

function contextIn(owner: Document): CanvasRenderingContext2D | null {
  if (contexts.has(owner)) return contexts.get(owner) ?? null;
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = owner.createElement('canvas').getContext('2d');
  } catch {
    // Some environments expose canvas while refusing to allocate a rendering context.
  }
  contexts.set(owner, context);
  return context;
}

// Canvas shapes one text run, not arbitrary CSS. Reject anything that needs HTML layout.
function canMeasure(element: HTMLElement, node: ProseMirrorNode, style: CSSStyleDeclaration) {
  return (
    node.type.name === 'paragraph' &&
    node.childCount === 1 &&
    node.firstChild?.isText &&
    node.firstChild.marks.length === 0 &&
    element.childNodes.length === 1 &&
    element.firstChild?.nodeType === 3 &&
    element.textContent === node.textContent &&
    /^[A-Za-z0-9,.!?:;'"()]+(?: [A-Za-z0-9,.!?:;'"()]+)*$/.test(node.textContent) &&
    hasSimpleTypography(style)
  );
}

function hasSimpleTypography(style: CSSStyleDeclaration): boolean {
  const supported = {
    whiteSpace: ['normal', 'pre-wrap'],
    writingMode: ['horizontal-tb'],
    direction: ['ltr'],
    textTransform: ['none'],
    letterSpacing: ['normal', '0px'],
    wordSpacing: ['normal', '0px'],
    textIndent: ['0px'],
    wordBreak: ['normal'],
    hyphens: ['none', 'manual'],
    fontVariant: ['normal'],
    fontFeatureSettings: ['normal'],
    fontVariationSettings: ['normal'],
    fontStretch: ['normal', '100%'],
    textWrapStyle: ['auto'],
  };
  return Object.entries(supported).every(([key, values]) =>
    values.includes(style[key as keyof typeof supported]),
  );
}

// Measure complete candidate lines so kerning and ligatures are shaped across word boundaries.
// Near a rounding boundary, or with a word that needs breaking, use the browser's actual layout.
function lineEnds(text: string, context: CanvasRenderingContext2D, width: number): number[] | null {
  const ends: number[] = [];
  const widths = new Map<string, number>();
  const measure = (value: string) => {
    const known = widths.get(value);
    if (known !== undefined) return known;
    const measured = context.measureText(value).width;
    if (widths.size < 512) widths.set(value, measured);
    return measured;
  };
  let start = 0;
  let previous = 0;
  for (const word of text.matchAll(/\S+/g)) {
    const end = word.index + word[0].length;
    const measured = measure(text.slice(start, end));
    if (Math.abs(measured - width) < roundingTolerance) return null;
    if (measured > width) {
      if (previous <= start || measure(word[0]) >= width - roundingTolerance) return null;
      ends.push(word.index);
      start = word.index;
    }
    previous = end;
  }
  ends.push(text.length);
  return ends;
}

// One DOM read validates wrapping and calibrates fractional line spacing and the font's line box.
// Every subsequent split query uses the cached offsets, without another Range layout query.
function textGeometry(
  element: HTMLElement,
  context: CanvasRenderingContext2D,
  { ends, text, scale }: { ends: readonly number[]; text: string; scale: number },
) {
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  const lines = new Map<number, { top: number; left: number; right: number; height: number }>();
  for (const rect of range.getClientRects()) {
    if (rect.width <= 0.5 || rect.height <= 0.5) continue;
    const top = Math.round(rect.top);
    const previous = lines.get(top);
    lines.set(top, {
      top: rect.top,
      height: rect.height,
      left: Math.min(previous?.left ?? rect.left, rect.left),
      right: Math.max(previous?.right ?? rect.right, rect.right),
    });
  }
  const boxes = [...lines.values()];
  const first = boxes[0];
  const last = boxes.at(-1);
  const count = ends.length;
  if (lines.size !== count || !first || !last) return null;
  // Canvas and CSS can shape even Latin text differently (for example automatic kerning).
  // Validate every line's width, not just the total number of lines, before trusting its offsets.
  const sameWidths = boxes.every((box, index) => {
    const width = context.measureText(text.slice(ends[index - 1] ?? 0, ends[index])).width;
    return Math.abs((box.right - box.left) / scale - width) < 0.1;
  });
  if (!sameWidths) return null;
  const step = count > 1 ? (last.top - first.top) / (count - 1) : 0;
  if (
    boxes.some(
      (box, index) =>
        Math.abs(box.height - first.height) / scale > 0.1 ||
        Math.abs(box.top - first.top - index * step) / scale > 0.1,
    )
  )
    return null;
  return { height: first.height / scale, step: step / scale };
}

/** A conservative canvas fast path for plain paragraphs; null asks for exact DOM ranges. */
export function measureCanvasText(
  element: HTMLElement,
  node: ProseMirrorNode,
  scale = 1,
): TextMeasurement | null {
  const win = element.ownerDocument.defaultView;
  const style = win?.getComputedStyle(element);
  if (!style || !canMeasure(element, node, style)) return null;
  const generated = (pseudo: string) => win?.getComputedStyle(element, pseudo).content;
  if (
    [generated('::before'), generated('::after')].some(
      (value) => value && !['none', 'normal'].includes(value),
    )
  )
    return null;
  const lineHeight = parseFloat(style.lineHeight);
  let width = parseFloat(style.width);
  if (style.boxSizing === 'border-box') {
    for (const value of [
      style.paddingLeft,
      style.paddingRight,
      style.borderLeftWidth,
      style.borderRightWidth,
    ])
      width -= parseFloat(value) || 0;
  }
  if (!(width > 0) || !(lineHeight > 0)) return null;
  const context = contextIn(element.ownerDocument);
  if (!context) return null;
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  // Canvas's auto may disable kerning that CSS auto enables; the line-width check verifies it.
  context.fontKerning =
    style.fontKerning === 'auto' ? 'normal' : (style.fontKerning as CanvasFontKerning);
  context.textRendering = style.textRendering as CanvasTextRendering;
  const ends = lineEnds(node.textContent, context, width);
  if (!ends) return null;
  const geometry = textGeometry(element, context, { ends, text: node.textContent, scale });
  if (!geometry) return null;
  return {
    offset: 0,
    measure(from, to) {
      if (to <= from) return { height: 0, lines: 0 };
      const first = ends.findIndex((end) => from < end);
      const last = ends.findIndex((end) => to <= end);
      const lines = first < 0 || last < first ? 0 : last - first + 1;
      return { height: lines ? geometry.height + (lines - 1) * geometry.step : 0, lines };
    },
  };
}
