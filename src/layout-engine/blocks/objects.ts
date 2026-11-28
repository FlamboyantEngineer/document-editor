// Objects that are not text or containers: figures and their captions, code with its caption,
// display equations, rules, page breaks, and the blocks drawn from stored markup. A size the
// template or the node fixes is computed; anything else is an atom measured once in the DOM
// (DOCE-PAGINATION-10.2, 10.4).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { isTextMeasurement } from '../../model/pagination/text-split.js';
import { parseObjectLayout } from '../../model/schema/object-layout.js';
import { type MathLayouts, placeMath } from '../math-atoms.js';
import type { TextAlign } from '../typography.js';
import { type BlockContext, type Laid, laid, notLaid } from './context.js';
import { linkedCodeFigure } from './linked-code.js';
import { continuedCaptionGrowth, layTextBlock } from './text-blocks.js';

function sizeAttr(value: unknown): number {
  const size = typeof value === 'string' ? Number(value) : value;
  return typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : 0;
}

/**
 * A figure's image box from its stored size, which every figure has (DOCE-SCHEMA-3.14): one set to
 * the page's width takes that width, and one wider than its place is narrowed to it, each scaled
 * whole, its height in its proportions (DOCE-PAGINATION-10.4).
 */
export function fixedImageBox(
  figure: ProseMirrorNode,
  available: number,
): { width: number; height: number } {
  const width = sizeAttr(figure.attrs.width);
  const height = sizeAttr(figure.attrs.height);
  const fit = parseObjectLayout(figure.attrs.objectLayout) === 'fit-page-width';
  const shown = fit ? available : Math.min(width, available);
  return { width: shown, height: width ? (height * shown) / width : 0 };
}

function captionHeight(
  context: BlockContext,
  caption: ProseMirrorNode,
  { width, align }: { width: number; align?: TextAlign | undefined },
) {
  const place = { ...context.place, width, ...(align ? { align } : {}) };
  return layTextBlock({ ...context, place, parent: 'other' }, caption);
}

// The alignment a figure gives its caption, which spans the content width: the figure's own, as
// the stylesheet draws it; none for a figure across the page width, whose caption keeps its own.
function figureCaptionAlign(figure: ProseMirrorNode): TextAlign | undefined {
  const layout = parseObjectLayout(figure.attrs.objectLayout);
  return layout === null || layout === 'fit-page-width' ? undefined : layout;
}

/** A figure: its image box and, unless switched off, its caption across the content width. */
export function layFigure(context: BlockContext, figure: ProseMirrorNode): Laid {
  const { width } = context.place;
  const image = fixedImageBox(figure, width);
  context.options.onObject?.(figure, {
    kind: 'figure',
    width: image.width,
    height: image.height,
    room: width,
  });
  let caption = 0;
  const line = figure.firstChild;
  if (figure.attrs.captionEnabled !== false && line) {
    const result = captionHeight(context, line, { width, align: figureCaptionAlign(figure) });
    if (!result.ok) return result;
    caption = result.block.height;
  }
  return laid({
    node: figure,
    height: image.height + caption,
    marginTop: 0,
    marginBottom: context.parent === 'region' ? 0 : context.metrics.paragraphAfter,
  });
}

/**
 * Code with its caption: one box padded as the code's own padding is, holding the caption above or
 * below the code with a rule and space between them, measured by its code's lines.
 */
export function layCodeFigure(context: BlockContext, figure: ProseMirrorNode): Laid {
  const caption = figure.firstChild;
  const code = figure.lastChild;
  if (figure.childCount !== 2 || !caption || !code) {
    return notLaid(figure, 'a code figure holds a caption and code');
  }
  const body = layTextBlock(context, code);
  if (!body.ok) return body;
  const metrics = context.metrics.code;
  let above = 0;
  let continuedCaption = 0;
  if (code.attrs.captionEnabled !== false) {
    const width = context.place.width - 2 * metrics.padding;
    const line = captionHeight(context, caption, { width });
    if (!line.ok) return line;
    above = line.block.height + 2 * metrics.captionGap + metrics.captionRule;
    const own = { ...context, place: { ...context.place, width }, parent: 'other' as const };
    continuedCaption = continuedCaptionGrowth(own, caption, line.block.height);
  }
  // Each part of a split code figure draws the caption again, so it is part of the room every
  // part takes beyond its lines; a later part's shows the continued suffix too.
  const { measurement } = body.block;
  return laid({
    ...body.block,
    node: figure,
    height: above + body.block.height,
    ...(isTextMeasurement(measurement)
      ? {
          measurement: {
            ...measurement,
            overhead: (measurement.overhead ?? 0) + above,
            ...(continuedCaption ? { continuedCaption } : {}),
          },
        }
      : {}),
  });
}

/**
 * Linked code: the host's code under the caption its address names, in the box a captioned code
 * block draws (`pre` with its caption line), so it is laid out as that code figure would be. Its
 * lines count from the start of its code, as its split reads them, and are numbered from its first
 * line's number.
 */
export function layLinkedCode(context: BlockContext, node: ProseMirrorNode): Laid {
  const linked = linkedCodeFigure(node);
  if (!linked) return notLaid(node, 'no code figure in the schema');
  const label = context.options.labelOf?.(node);
  const labelOf = (line: ProseMirrorNode) =>
    line === linked.caption ? label : context.options.labelOf?.(line);
  const options = { ...context.options, labelOf };
  const result = layCodeFigure({ ...context, options }, linked.figure);
  return result.ok ? laid({ ...result.block, node }) : notLaid(node, result.reason);
}

/**
 * A display equation, with the stylesheet's margins: from its layout, or the reserved box, scaled
 * down to fit the line less its tag (DOCE-PAGINATION-12.10).
 */
export function layDisplayMath(context: BlockContext, node: ProseMirrorNode): Laid {
  const { math } = context.metrics;
  const margins = { top: math.before, bottom: math.after };
  const size = context.options.atoms.measureBlockAtom(
    node,
    context.place.width,
    context.place.scope,
  );
  if (!size?.math) return notLaid(node, 'math without a layout');
  const end = endRoom(context, node, size.math);
  const fitted = placeMath(size.math, context.place.width, end.room);
  const placed = end.tag ? { ...fitted, tagEnd: end.tag } : fitted;
  context.options.onMath?.(node, placed);
  const { ascent, descent } = placed.box;
  const tag = size.math.tag;
  // The tag sits on the equation's baseline, unscaled.
  const height = Math.max(ascent, tag?.ascent ?? 0) + Math.max(descent, tag?.descent ?? 0);
  const flush = context.parent === 'region';
  return laid({
    node,
    height,
    marginTop: flush ? 0 : margins.top,
    marginBottom: flush ? 0 : margins.bottom,
  });
}

// The room a display equation's line keeps at its end: its tag, then its automatic number, side
// by side with an em between them, and an em before the equation, in its font; and how far the
// tag sits from the line's end, past the number and its em. Both 0 without a tag or number.
function endRoom(
  { options, place }: BlockContext,
  node: ProseMirrorNode,
  math: MathLayouts,
): { room: number; tag: number } {
  const width = (text: string) => options.text.textWidth?.(text, node, place.scope) ?? 0;
  const number = options.equationOf?.(node);
  const em = width(EM_SPACE);
  const numbered = number ? width(number) : 0;
  const tag = math.tag && numbered ? numbered + em : 0;
  const end = tag + (math.tag?.width ?? 0) || numbered;
  return { room: end ? end + em : 0, tag };
}

const EM_SPACE = '\u2003';

/** A horizontal rule: its borders, with the stylesheet's margins. */
export function layRule(context: BlockContext, node: ProseMirrorNode): Laid {
  const { rule } = context.metrics;
  const flush = context.parent === 'region';
  return laid({
    node,
    height: rule.height,
    marginTop: flush ? 0 : rule.before,
    marginBottom: flush ? 0 : rule.after,
  });
}

/** A page break: a marker that takes no height. */
export function layPageBreak(node: ProseMirrorNode): Laid {
  return laid({ node, height: 0, marginTop: 0, marginBottom: 0 });
}

/**
 * A kept block, which holds content the schema does not know as markup: nothing lays it out, so it
 * takes no room and is reported (DOCE-PAGINATION-14.4).
 */
export function layKeptBlock(node: ProseMirrorNode): Laid {
  return notLaid(node, 'kept content the schema does not know takes no room');
}
