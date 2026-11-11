// The pages' layout, shown for debugging: each page carries the height its blocks take and the
// height left of what it has for them, as the last layout measured them, for a stylesheet to show.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { pageMetrics } from './pagination.js';

/** Marks a transaction that shows or hides the layout, after `shown` changed. */
export const pageDebugKey = new PluginKey('page-debug');

const drawn = new WeakMap<ProseMirrorNode, DecorationSet>();

function decorate(state: EditorState): DecorationSet {
  const cached = drawn.get(state.doc);
  if (cached) return cached;
  const metrics = pageMetrics(state);
  if (!metrics) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  let index = 0;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'page') return node.type.name === 'page_section';
    const metric = metrics[index];
    index += 1;
    if (metric) {
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, {
          'data-debug-used': String(Math.round(metric.used)),
          'data-debug-free': String(Math.round(metric.available - metric.used)),
        }),
      );
    }
    return false;
  });
  const set = DecorationSet.create(state.doc, decorations);
  drawn.set(state.doc, set);
  return set;
}

/** Shows the pages' layout while `shown` holds (`data-debug-used`, `data-debug-free`). */
export function createPageDebug({ shown }: { shown: () => boolean }): Plugin {
  return new Plugin({
    key: pageDebugKey,
    props: { decorations: (state) => (shown() ? decorate(state) : null) },
  });
}
