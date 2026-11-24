// Block geometry: each block's height, margins and the measurement its split reads, computed from
// the text layout engine's lines, the atom cache and the template's numbers, with no DOM. The
// result has the shape the DOM measuring gives the page layout (`LayoutBlock`), so the page
// packer and the splitters read it unchanged (DOCE-PAGINATION-10.3).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { layLayoutSection, layList, layPlainContainer, layQuote } from './containers.js';
import { layContents } from './contents.js';
import { type BlockContext, type BlockParent, type Laid, notLaid } from './context.js';
import type { BlockMetrics } from './metrics.js';
import {
  layCodeFigure,
  layDisplayMath,
  layFigure,
  layLinkedCode,
  layMarkupBlock,
  layPageBreak,
  layRule,
} from './objects.js';
import { layFootnoteArea, layHeaderOrFooter } from './regions.js';
import { layTableFigure } from './tables.js';
import { layTextBlock } from './text-blocks.js';
import type { BlockLayout, BlockLayoutOptions, BlockPlace } from './types.js';

type Lay = (context: BlockContext, node: ProseMirrorNode) => Laid;

const LAYS: Readonly<Record<string, Lay>> = {
  paragraph: layTextBlock,
  heading: layTextBlock,
  code_block: layTextBlock,
  bullet_list: layList,
  ordered_list: layList,
  blockquote: layQuote,
  script_block: layPlainContainer,
  embed: layPlainContainer,
  layout_section: layLayoutSection,
  table_figure: layTableFigure,
  code_figure: layCodeFigure,
  linked_code_block: layLinkedCode,
  figure: layFigure,
  math_display: layDisplayMath,
  horizontal_rule: layRule,
  page_break: (_context, node) => layPageBreak(node),
  kept_block: layMarkupBlock,
  dynamic_template: layMarkupBlock,
  toc_block: layContents,
};

/** Creates block geometry over a text layout, an atom cache and the template's numbers. */
export function createBlockLayout(options: BlockLayoutOptions): BlockLayout {
  const metricsByScope = new Map<string | null, BlockMetrics>();
  const metricsOf = (scope: string | null) => {
    let metrics = metricsByScope.get(scope);
    if (!metrics) {
      metrics = options.metrics(scope);
      metricsByScope.set(scope, metrics);
    }
    return metrics;
  };

  const contextOf = (place: BlockPlace, parent: BlockParent): BlockContext => ({
    options,
    place,
    metrics: metricsOf(place.scope ?? null),
    parent,
    child: (child, at) => layIn(child, { ...place, width: at.width }, at.parent),
  });

  function layIn(node: ProseMirrorNode, place: BlockPlace, parent: BlockParent): Laid {
    if (!(place.width > 0)) return notLaid(node, 'no width is left for the block');
    const lay = Object.hasOwn(LAYS, node.type.name) ? LAYS[node.type.name] : undefined;
    if (!lay) return notLaid(node, `${node.type.name} is not laid out by the engine yet`);
    return lay(contextOf(place, parent), node);
  }

  // A header's or footer's own blocks take no vertical margins.
  const layRegionBlock = (node: ProseMirrorNode, place: BlockPlace): Laid => {
    const result = layIn(node, place, 'region');
    if (!result.ok) return result;
    return { ...result, block: { ...result.block, marginTop: 0, marginBottom: 0 } };
  };

  return {
    layoutBlock: (node, place) => {
      const inRegion = place.region === 'header' || place.region === 'footer';
      return inRegion ? layRegionBlock(node, place) : layIn(node, place, 'page');
    },
    layoutRegion: (node, place) => {
      const name = node.type.name;
      if (name === 'page_footnotes') return layFootnoteArea(contextOf(place, 'other'), node);
      if (name !== 'page_header' && name !== 'page_footer') {
        return { ok: false, node, reason: `${name} is not a page region` };
      }
      const region = name === 'page_header' ? 'header' : 'footer';
      const at = { ...place, region } as const;
      return layHeaderOrFooter(contextOf(at, 'region'), node, (child) => layRegionBlock(child, at));
    },
  };
}
