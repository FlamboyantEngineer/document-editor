// Math sized and drawn by one deterministic layout (DOCE-PAGINATION-12.10): a math layouter lays
// a typeset equation's MathML out at its font size, with no DOM, into its box and the SVG every
// renderer draws, so the box the engine lays the pages out with is the one drawn on every system.
// The engine scales an equation wider than the room it has down to fit, uniformly, as an image is,
// and records the box and scale each math node was laid out at for the renderers.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { MathTree, TypesetMath } from '../engine/math-typeset.js';
import { clusterCount, mathTreeText } from '../utils/math-text.js';
import type { AtomMeasurer, AtomPlace, AtomSize } from './atoms.js';
import { splitTag } from './math-tags.js';

/**
 * An equation laid out by a math layouter, in CSS px at the size it was laid out at, each length
 * rounded up to 1/64 px.
 */
export interface LaidMath {
  /** The advance width. */
  readonly width: number;
  /** Above the baseline. */
  readonly ascent: number;
  /** Below the baseline. */
  readonly descent: number;
  /**
   * The drawing: one `<svg>` element as data, whose `viewBox` is the box, without a width, height or
   * style; only `svg`, `g`, `path`, `rect` and `line`, filled with `currentColor` or the colour the MathML
   * set (`MATH_DRAWING_ELEMENTS`, `MATH_DRAWING_ATTRIBUTES`).
   */
  readonly svg: MathTree;
  /** Characters the layouter has no glyph for; math with any takes the reserved box instead. */
  readonly missing: string;
}

/** Lays MathML out deterministically from a math font's data, without the DOM. */
export interface MathLayouter {
  /** Names the layouter and its font's versions, for caches and the pages' layout. */
  readonly key: string;
  /**
   * Loads what laying the trees out needs, such as glyph ranges; null when nothing is to load, so
   * `layout` answers for them now.
   */
  prepare(trees: readonly MathTree[]): Promise<void> | null;
  /** The layout of a typeset `<math>` element; null when it cannot be laid out. */
  layout(tree: MathTree, display: boolean, sizePx: number): LaidMath | null;
}

/** An equation's layout, with a display equation's tag (`\\tag`), which is laid out on its own. */
export interface MathLayouts {
  readonly math: LaidMath;
  /** Drawn at the line's end, never scaled; the equation's room is the line less its width. */
  readonly tag?: LaidMath | undefined;
  /**
   * Math the layouter could not lay out, or that holds characters it has no glyph for: it takes the
   * reserved box (DOCE-PAGINATION-12.9), its MathML drawn by the browser inside it.
   */
  readonly reserved?: true | undefined;
}

// The reserved box of math with no layout (DOCE-PAGINATION-12.9), in ems: inline, one em per
// cluster it draws, one em tall, its bottom 0.2 em below the baseline; a display equation two ems
// tall across the line, which it never widens.
const RESERVED_ASCENT = 0.8;
const RESERVED_DESCENT = 0.2;
const RESERVED_DISPLAY = 2;
const NO_DRAWING: MathTree = { tag: 'svg', attrs: {}, children: [] };

/** The reserved box of math drawing `clusters` grapheme clusters at a font size, as a layout. */
export function reservedMath(clusters: number, display: boolean, size: number): MathLayouts {
  const box = display
    ? { width: 0, ascent: RESERVED_DISPLAY * size, descent: 0 }
    : { width: clusters * size, ascent: RESERVED_ASCENT * size, descent: RESERVED_DESCENT * size };
  const round = {
    width: upToUnit(box.width),
    ascent: upToUnit(box.ascent),
    descent: upToUnit(box.descent),
  };
  return { math: { ...round, svg: NO_DRAWING, missing: '' }, reserved: true };
}

/** The elements a math drawing holds. */
export const MATH_DRAWING_ELEMENTS: ReadonlySet<string> = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'line',
]);

/** The attributes a math drawing's elements hold. */
export const MATH_DRAWING_ATTRIBUTES: ReadonlySet<string> = new Set([
  'viewBox',
  'transform',
  'd',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'width',
  'height',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linecap',
  'overflow',
]);

/** The scale below which a fitted equation is listed with its scale, as hard to read. */
export const MATH_MIN_REPORTED_SCALE = 0.5;

// The engine's layout unit: boxes are rounded up to it, so a box never draws past its room.
const LAYOUT_UNITS_PER_PX = 64;
const upToUnit = (value: number) => Math.ceil(value * LAYOUT_UNITS_PER_PX) / LAYOUT_UNITS_PER_PX;
const downToUnit = (value: number) => Math.floor(value * LAYOUT_UNITS_PER_PX) / LAYOUT_UNITS_PER_PX;

/**
 * The one uniform scale an equation of `width` is drawn at in `available` room: 1 when it fits,
 * else the room over the width, never above 1 and with no floor; snapped down to 1/65536 so every
 * renderer reads the same number.
 */
export function fitScale(width: number, available: number): number {
  if (!(width > 0) || width <= available) return 1;
  const scale = Math.max(0, available) / width;
  return Math.floor(scale * 65_536) / 65_536;
}

/** An equation's box at a scale, rounded up to the layout unit. */
interface ScaledMathBox {
  readonly width: number;
  readonly ascent: number;
  readonly descent: number;
  readonly scale: number;
}

/** The box a layout takes at a scale. */
function scaledBox(math: LaidMath, scale: number): ScaledMathBox {
  return {
    width: upToUnit(math.width * scale),
    ascent: upToUnit(math.ascent * scale),
    descent: upToUnit(math.descent * scale),
    scale,
  };
}

/** Where a math node was laid out: its layout, and the box and scale it takes on the pages. */
export interface PlacedMath extends MathLayouts {
  readonly box: ScaledMathBox;
  /**
   * The room kept free at the line's end for a display equation's tag or automatic number, the
   * wider of the two; 0 without either.
   */
  readonly end: number;
  /** How far a display equation's tag sits from its line's end, past its automatic number. */
  readonly tagEnd?: number;
}

/** Told the math nodes laid out, with what they were laid out at. */
export type MathRecorder = (node: ProseMirrorNode, placed: PlacedMath) => void;

/**
 * Places an equation in `available` room less what its line's end keeps (`end`): its tag, or the
 * room a display equation's block keeps for its tag or automatic number and the gap before it,
 * the wider of the two. Inline math only shrinks when wider than its whole line.
 */
export function placeMath(laid: MathLayouts, available: number, end = 0): PlacedMath {
  const kept = upToUnit(Math.max(laid.tag?.width ?? 0, end));
  const scale = fitScale(laid.math.width, downToUnit(available - kept));
  return { ...laid, box: scaledBox(laid.math, scale), end: kept };
}

/** Whether a node is math. */
const isMathNode = (node: ProseMirrorNode) =>
  node.type.name === 'math_inline' || node.type.name === 'math_display';

/** What the math measurer lays out with. */
interface MathAtomOptions {
  /** The layouter, or null while there is none (no math face served, or not loaded yet). */
  readonly layouter: () => MathLayouter | null;
  /** What a math node was typeset as, by the math views; null before it is. */
  readonly typesetOf: (node: ProseMirrorNode) => TypesetMath | null;
  /** The font size in CSS px math in a place is drawn at. */
  readonly sizeOf: (node: ProseMirrorNode, place: AtomPlace) => number;
  /** Told the characters of math the layouter has no glyphs for, which takes the reserved box. */
  readonly missing?: ((text: string) => void) | undefined;
  /** Told the text of math the layouter refused, which takes the reserved box. */
  readonly refused?: ((text: string) => void) | undefined;
}

// The size of an equation's unscaled layouts, which carries them for the engine to place.
function sizeOfLaid(laid: MathLayouts, inline: boolean): AtomSize {
  const { math, tag } = laid;
  const ascent = Math.max(math.ascent, tag?.ascent ?? 0);
  const height = upToUnit(ascent + Math.max(math.descent, tag?.descent ?? 0));
  const width = upToUnit(math.width + (tag?.width ?? 0));
  return inline
    ? { width, height, baseline: upToUnit(ascent), math: laid }
    : { width, height, math: laid };
}

// An equation's layouts, or its reserved box when the layouter refuses it or has no glyph for
// a character it draws.
function layoutsOf(
  layouter: MathLayouter,
  { tree, parts }: { tree: MathTree; parts: { math: MathTree; tag: MathTree | null } },
  at: { display: boolean; size: number; options: MathAtomOptions },
): MathLayouts {
  const math = layouter.layout(parts.math, at.display, at.size);
  const tag = parts.tag ? layouter.layout(parts.tag, false, at.size) : null;
  const text = mathTreeText(tree);
  const reserved = () => reservedMath(clusterCount(text), at.display, at.size);
  if (!math || (parts.tag && !tag)) {
    at.options.refused?.(text);
    return reserved();
  }
  const missing = math.missing + (tag?.missing ?? '');
  if (missing) {
    at.options.missing?.(missing);
    return reserved();
  }
  return tag ? { math, tag } : { math };
}

/**
 * Whether a math node waits for what sizes it: a layouter is there, but the node is not typeset
 * yet, or its glyphs still load (DOCE-PAGINATION-12.13). Its reserved box is then provisional.
 */
export function mathWaits(
  { layouter, typesetOf }: Pick<MathAtomOptions, 'layouter' | 'typesetOf'>,
  node: ProseMirrorNode,
): boolean {
  const using = layouter();
  if (!using || !isMathNode(node)) return false;
  const typeset = typesetOf(node);
  if (!typeset) return true;
  return typeset.state === 'ready' && mathPending(using, [typeset.math], !node.isInline) !== null;
}

/**
 * The atom measurer that sizes typeset math from its layout (DOCE-PAGINATION-12.10), and nothing
 * else. Math it cannot lay out now takes the reserved box: without a layouter, before its source is
 * typeset or once it typeset as invalid, or while its glyphs still load, which the pages wait for
 * before they lay it out (`mathPending`, DOCE-PAGINATION-14.4). The box given while the math waits
 * for its typeset answer or its glyphs is provisional (DOCE-PAGINATION-12.13).
 */
export function createMathAtomMeasurer(options: MathAtomOptions): AtomMeasurer {
  const { layouter, typesetOf, sizeOf } = options;
  return (node, _width, place = {}): AtomSize | null => {
    if (!isMathNode(node)) return null;
    const display = !node.isInline;
    const size = sizeOf(node, place);
    const using = layouter();
    const typeset = using ? typesetOf(node) : null;
    if (!using || typeset?.state !== 'ready' || mathPending(using, [typeset.math], display)) {
      const text = node.textContent;
      const reserved = sizeOfLaid(reservedMath(clusterCount(text), display, size), !display);
      const waits = using && (!typeset || typeset.state === 'ready');
      return waits ? { ...reserved, provisional: true } : reserved;
    }
    const tree = typeset.math;
    const parts = display ? splitTag(tree) : { math: tree, tag: null };
    return sizeOfLaid(layoutsOf(using, { tree, parts }, { display, size, options }), !display);
  };
}

/**
 * Whether a layouter still loads what laying typeset math out needs, such as glyph ranges: a
 * promise that settles once it has, or null when it can lay all of it out now. A display
 * equation's tag is prepared with it.
 */
export function mathPending(
  layouter: MathLayouter,
  trees: readonly MathTree[],
  display: boolean,
): Promise<void> | null {
  const parts = trees.flatMap((tree) => {
    if (!display) return [tree];
    const split = splitTag(tree);
    return split.tag ? [split.math, split.tag] : [split.math];
  });
  return parts.length ? layouter.prepare(parts) : null;
}
