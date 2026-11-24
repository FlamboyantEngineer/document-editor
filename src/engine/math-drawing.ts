// Math drawn from its layout (DOCE-PAGINATION-12.11): the SVG the math layouter computed, at the box
// and scale the pages' engine placed it at, so every renderer, the editor's views, the viewer,
// static pages and a print, draws exactly what was measured. The typeset MathML stays beside it,
// hidden from sight but not from screen readers, copy and find.

import type { Decoration } from 'prosemirror-view';
import {
  MATH_DRAWING_ATTRIBUTES,
  MATH_DRAWING_ELEMENTS,
  type PlacedMath,
} from '../layout-engine/math-atoms.js';
import type { MathTree } from './math-typeset.js';

/** What a math node's decoration says: where the engine placed its layout. */
export interface MathDrawingSpec {
  readonly mathDrawing: PlacedMath;
}

/**
 * How the engine placed math, as `data-math-layout` says on its element: drawn from its layout, or
 * in the reserved box of math with none (DOCE-PAGINATION-12.9), its MathML drawn by the browser.
 */
const LAID_MATH = 'laid';
const RESERVED_MATH = 'reserved';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

// A length as the hooks give it: at most six decimals, which a 1/64 px box needs.
const length = (value: number) => String(Math.round(value * 1e6) / 1e6);
const px = (value: number) => `${length(value)}px`;

/**
 * The hooks on a math element the engine placed: `data-math-layout` (`laid` or `reserved`), and its box and
 * scale as `--de-math-width`, `--de-math-ascent`, `--de-math-descent` and `--de-math-scale`, with
 * a display equation's tag's as `--de-math-tag-width`, `--de-math-tag-ascent` and
 * `--de-math-tag-descent`.
 */
export function mathDrawingHooks(placed: PlacedMath): {
  'data-math-layout': string;
  style: string;
} {
  const { box, tag } = placed;
  const lengths = [
    `--de-math-width: ${px(box.width)}`,
    `--de-math-ascent: ${px(box.ascent)}`,
    `--de-math-descent: ${px(box.descent)}`,
    `--de-math-scale: ${String(box.scale)}`,
  ];
  if (placed.end) lengths.push(`--de-math-end: ${px(placed.end)}`);
  if (placed.tagEnd) lengths.push(`--de-math-tag-end: ${px(placed.tagEnd)}`);
  if (tag)
    lengths.push(
      `--de-math-tag-width: ${px(tag.width)}`,
      `--de-math-tag-ascent: ${px(tag.ascent)}`,
      `--de-math-tag-descent: ${px(tag.descent)}`,
    );
  const layout = placed.reserved ? RESERVED_MATH : LAID_MATH;
  return { 'data-math-layout': layout, style: lengths.join('; ') };
}

// A drawing's tree held to the drawing's elements and attributes.
function heldTree(tree: MathTree): MathTree | null {
  if (!MATH_DRAWING_ELEMENTS.has(tree.tag)) return null;
  const attrs: Record<string, string> = {};
  for (const [name, value] of Object.entries(tree.attrs))
    if (MATH_DRAWING_ATTRIBUTES.has(name)) attrs[name] = value;
  const children = tree.children.flatMap((child) => {
    if (typeof child === 'string') return [];
    const held = heldTree(child);
    return held ? [held] : [];
  });
  return { tag: tree.tag, attrs, children };
}

// One drawing at a size: its viewBox scales its content to the box.
function sized(svg: MathTree, className: string, size: { width: number; height: number }) {
  const held = heldTree(svg);
  if (held?.tag !== 'svg') return null;
  const attrs = {
    ...held.attrs,
    class: className,
    width: length(size.width),
    height: length(size.height),
    'aria-hidden': 'true',
  };
  return { ...held, attrs };
}

/**
 * The SVG elements a math element draws, as data, in order: the equation at its box
 * (`de-math__drawing`) and a display equation's tag at its own size (`de-math__tag`); none when a
 * drawing holds no `<svg>`.
 */
export function mathDrawingTrees(placed: PlacedMath): MathTree[] {
  const { box, math, tag } = placed;
  if (placed.reserved) return [];
  const drawing = sized(math.svg, 'de-math__drawing', {
    width: box.width,
    height: box.ascent + box.descent,
  });
  if (!drawing) return [];
  const tagged = tag
    ? sized(tag.svg, 'de-math__tag', { width: tag.width, height: tag.ascent + tag.descent })
    : null;
  return tagged ? [drawing, tagged] : [drawing];
}

// The layout a math node's decorations place it at (`MathDrawingSpec`), if any.
function placedIn(decorations: readonly Decoration[]): PlacedMath | null {
  for (const decoration of decorations) {
    const spec = decoration.spec as Partial<MathDrawingSpec> | undefined;
    if (spec?.mathDrawing) return spec.mathDrawing;
  }
  return null;
}

/**
 * What a math view draws in its element once typeset: the drawing its decorations place, if any,
 * then its typeset MathML, which the stylesheet hides from sight under a drawing.
 */
export function drawnMathIn(dom: HTMLElement, decorations: readonly Decoration[]) {
  let typeset: Element | null = null;
  let placed = placedIn(decorations);
  const draw = () => {
    if (!typeset) return;
    const trees = placed ? mathDrawingTrees(placed) : [];
    dom.replaceChildren(...trees.map((tree) => svgElement(tree, dom.ownerDocument)), typeset);
  };
  return {
    /** Draws the typeset MathML, or forgets it while the math typesets or is invalid. */
    show(element: Element | null) {
      typeset = element;
      draw();
    },
    /** Draws the placement the decorations give, when it differs from the one drawn. */
    place(next: readonly Decoration[]) {
      const now = placedIn(next);
      if (now === placed) return;
      placed = now;
      draw();
    },
  };
}

/** A drawing's tree as SVG elements in a document. */
function svgElement(tree: MathTree, document: Document): SVGElement {
  const element = document.createElementNS(SVG_NAMESPACE, tree.tag) as SVGElement;
  for (const [name, value] of Object.entries(tree.attrs)) element.setAttribute(name, value);
  for (const child of tree.children)
    if (typeof child !== 'string') element.append(svgElement(child, document));
  return element;
}
