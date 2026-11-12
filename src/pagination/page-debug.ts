// The pages' layout, shown for debugging: each page carries the height its blocks take and the
// height left of what it has for them, and each block its own height, as the last layout measured
// them, for a stylesheet to show.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey } from 'prosemirror-state';
import { type Decoration, DecorationSet } from 'prosemirror-view';
import { viewOnlyNode } from '../utils/view-only-decorations.js';
import type { PageMetric } from './layout-document.js';
import { pageMetrics } from './pagination.js';

/** What the layout debugging shows. */
export interface PageDebugParts {
  /** What each page's blocks take of its height, and what is left. */
  readonly pages?: boolean | undefined;
  /** Each block's measured height. */
  readonly blocks?: boolean | undefined;
}

/** Marks a transaction that shows or hides the layout, after `shown` changed. */
export const pageDebugKey = new PluginKey('page-debug');

const drawn = new WeakMap<ProseMirrorNode, Map<string, DecorationSet>>();

// A page's own attributes, and its blocks', as the parts shown ask.
function decoratePage(
  { node, pos }: { readonly node: ProseMirrorNode; readonly pos: number },
  metric: PageMetric,
  parts: PageDebugParts,
): Decoration[] {
  const decorations: Decoration[] = [];
  if (parts.pages) {
    decorations.push(
      viewOnlyNode(
        { from: pos, to: pos + node.nodeSize },
        {
          'data-debug-used': String(Math.round(metric.used)),
          'data-debug-free': String(Math.round(metric.available - metric.used)),
        },
      ),
    );
  }
  if (!parts.blocks) return decorations;
  node.forEach((region, offset) => {
    if (region.type.name !== 'page_content') return;
    const start = pos + 1 + offset + 1;
    region.forEach((block, blockOffset, index) => {
      const height = metric.blocks[index];
      if (height === undefined) return;
      const from = start + blockOffset;
      decorations.push(
        viewOnlyNode(
          { from, to: from + block.nodeSize },
          {
            'data-debug-height': String(Math.round(height)),
          },
        ),
      );
    });
  });
  return decorations;
}

function decorate(state: EditorState, parts: PageDebugParts): DecorationSet {
  const key = `${String(Boolean(parts.pages))} ${String(Boolean(parts.blocks))}`;
  const cached = drawn.get(state.doc)?.get(key);
  if (cached) return cached;
  const metrics = pageMetrics(state);
  if (!metrics) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  let index = 0;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'page') return node.type.name === 'page_section';
    const metric = metrics[index];
    index += 1;
    if (metric) decorations.push(...decoratePage({ node, pos }, metric, parts));
    return false;
  });
  const set = DecorationSet.create(state.doc, decorations);
  const sets = drawn.get(state.doc) ?? new Map<string, DecorationSet>();
  sets.set(key, set);
  drawn.set(state.doc, sets);
  return set;
}

/**
 * Shows the pages' layout while `shown` asks: each page's (`data-debug-used`, `data-debug-free`)
 * and each block's (`data-debug-height`).
 */
export function createPageDebug({ shown }: { shown: () => PageDebugParts }): Plugin {
  return new Plugin({
    key: pageDebugKey,
    props: {
      decorations: (state) => {
        const parts = shown();
        return parts.pages || parts.blocks ? decorate(state, parts) : null;
      },
    },
  });
}
