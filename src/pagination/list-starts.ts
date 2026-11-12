// An ordered list that starts past 1, as a list's continuation on a later page does, tells how many
// items come before it as `--de-list-start`, so a stylesheet's own counter numbers on from them.
// It is drawn on the pages, not written into the document's markup.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { isInlineTextOnly } from '../engine/transaction-kind.js';

/** The plugin that draws the ordered lists' starts. */
export const listStartsKey = new PluginKey<DecorationSet>('list-starts');

function decorate(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.isTextblock) return false;
    const order = Number(node.attrs.order ?? 1);
    if (node.type.name === 'ordered_list' && order > 1) {
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, {
          style: `--de-list-start: ${String(order - 1)}`,
        }),
      );
    }
    return true;
  });
  return DecorationSet.create(doc, decorations);
}

/** Draws how many items come before each ordered list that starts past 1 (DOCE-PAGINATION-4.1). */
export function createListStarts(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: listStartsKey,
    state: {
      init: (_config, state) => decorate(state.doc),
      // Typing moves the lists it does not change, off the keystroke's path (DOCE-EDITING-3.4).
      apply(tr, set) {
        if (!tr.docChanged) return set;
        return isInlineTextOnly(tr) ? set.map(tr.mapping, tr.doc) : decorate(tr.doc);
      },
    },
    props: { decorations: (state) => listStartsKey.getState(state) ?? null },
  });
}
