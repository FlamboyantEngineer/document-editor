// A page's header, footer and footnote area: a header or footer is its blocks without margins, at
// least the template's height, apart from the content by its spacing; the footnote area is its
// entries under the separator, the template's spacing apart (DOCE-PAGINATION-10.6).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { ChildLayout, LayoutBlock } from '../../model/index.js';
import type { BlockContext } from './context.js';
import { stackBoxes } from './stack.js';
import { layTextBlock } from './text-blocks.js';
import type { RegionGeometry } from './types.js';

type Lay = (node: ProseMirrorNode) => ReturnType<typeof layTextBlock>;

function stackedRegion(
  region: ProseMirrorNode,
  lay: Lay,
): { blocks: LayoutBlock[]; provisional: boolean } | RegionGeometry {
  const blocks: LayoutBlock[] = [];
  let provisional = false;
  for (let index = 0; index < region.childCount; index += 1) {
    const result = lay(region.child(index));
    if (!result.ok) return result;
    blocks.push({ ...result.block, marginTop: 0, marginBottom: 0 });
    provisional ||= result.provisional;
  }
  return { blocks, provisional };
}

const isGeometry = (value: object): value is RegionGeometry => 'ok' in value;

const EMPTY: RegionGeometry = { ok: true, height: 0, gap: 0, children: [], provisional: false };

/** A page header's or footer's height and the space between it and the content. */
export function layHeaderOrFooter(
  context: BlockContext,
  region: ProseMirrorNode,
  lay: Lay,
): RegionGeometry {
  if (!region.childCount) return EMPTY;
  const stacked = stackedRegion(region, lay);
  if (isGeometry(stacked)) return stacked;
  const children = stackBoxes(stacked.blocks);
  const own = region.type.name === 'page_header' ? context.metrics.header : context.metrics.footer;
  const span = children.at(-1)?.bottom ?? 0;
  return {
    ok: true,
    height: Math.max(own.minHeight, span),
    gap: own.gap,
    children,
    provisional: stacked.provisional,
  };
}

/** A page's footnote area: its entries under the separator, the template's spacing apart. */
export function layFootnoteArea(context: BlockContext, area: ProseMirrorNode): RegionGeometry {
  if (!area.childCount) return EMPTY;
  const { separator, spacing, entrySpacing } = context.metrics.footnotes;
  const stacked = stackedRegion(area, (entry) =>
    layTextBlock({ ...context, parent: 'other' }, entry),
  );
  if (isGeometry(stacked)) return stacked;
  const children: ChildLayout[] = [];
  let bottom = 0;
  for (const block of stacked.blocks) {
    const top = children.length ? bottom + entrySpacing : 0;
    bottom = top + block.height;
    children.push({ top, bottom, measurement: block.measurement });
  }
  return {
    ok: true,
    height: separator + spacing + bottom,
    gap: 0,
    children,
    provisional: stacked.provisional,
  };
}
