// Objects that are not text or containers: figures and their captions, code with its caption,
// display equations, rules, page breaks, and the blocks drawn from stored markup. A size the
// template or the node fixes is computed; anything else is an atom measured once in the DOM
// (DOCE-PAGINATION-10.2, 10.4).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { parseObjectLayout } from '../../model/schema/object-layout.js';
import { type BlockContext, type Laid, laid, notLaid } from './context.js';
import { layTextBlock } from './text-blocks.js';

function sizeAttr(value: unknown): number {
  const size = typeof value === 'string' ? Number(value) : value;
  return typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : 0;
}

/**
 * A figure's image box from its stored size where that fixes it: one set to the page's width
 * keeps its ratio, a sized one keeps its height and narrows to the width; null otherwise.
 */
export function fixedImageBox(
  figure: ProseMirrorNode,
  available: number,
): { width: number; height: number } | null {
  const width = sizeAttr(figure.attrs.width);
  const height = sizeAttr(figure.attrs.height);
  if (!width || !height) return null;
  if (parseObjectLayout(figure.attrs.objectLayout) === 'fit-page-width') {
    return { width: available, height: (height * available) / width };
  }
  return { width: Math.min(width, available), height };
}

function atomBlock(context: BlockContext, node: ProseMirrorNode, margins = { top: 0, bottom: 0 }) {
  const size = context.options.atoms.measureBlockAtom(node, context.place.width);
  if (!size) return notLaid(node, `${node.type.name} has no measured size`);
  const flush = context.parent === 'region';
  return laid(
    {
      node,
      height: size.height,
      marginTop: flush ? 0 : margins.top,
      marginBottom: flush ? 0 : margins.bottom,
    },
    size.provisional,
  );
}

function captionHeight(context: BlockContext, caption: ProseMirrorNode, width: number) {
  return layTextBlock({ ...context, place: { ...context.place, width }, parent: 'other' }, caption);
}

/** A figure: its image box and, unless switched off, its caption across the content width. */
export function layFigure(context: BlockContext, figure: ProseMirrorNode): Laid {
  const { width } = context.place;
  const fixed = fixedImageBox(figure, width);
  const measured = fixed ? null : context.options.atoms.measureBlockAtom(figure, width);
  const image = fixed ?? measured;
  if (!image) return notLaid(figure, 'the figure has no stored or measured size');
  let caption = 0;
  const line = figure.firstChild;
  if (figure.attrs.captionEnabled !== false && line) {
    const result = captionHeight(context, line, width);
    if (!result.ok) return result;
    caption = result.block.height;
  }
  return laid(
    {
      node: figure,
      height: image.height + caption,
      marginTop: 0,
      marginBottom: context.parent === 'region' ? 0 : context.metrics.paragraphAfter,
    },
    measured?.provisional ?? false,
  );
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
  if (code.attrs.captionEnabled !== false) {
    const line = captionHeight(context, caption, context.place.width - 2 * metrics.padding);
    if (!line.ok) return line;
    above = line.block.height + 2 * metrics.captionGap + metrics.captionRule;
  }
  return laid({
    ...body.block,
    node: figure,
    height: above + body.block.height,
  });
}

/** A display equation, measured as an atom, with the stylesheet's margins. */
export function layDisplayMath(context: BlockContext, node: ProseMirrorNode): Laid {
  const { math } = context.metrics;
  return atomBlock(context, node, { top: math.before, bottom: math.after });
}

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

/** A block drawn from stored or generated markup, measured as an atom. */
export function layMarkupBlock(context: BlockContext, node: ProseMirrorNode): Laid {
  return atomBlock(context, node);
}
