// The hard break a split paragraph's later fragment starts with (DOCE-PAGINATION-3.6): the split
// moves a break that ends a fragment's last line to the next fragment's start, and this marks it so
// the stylesheet hides it, as the layout takes it to start no line.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

const splitBreaksKey = new PluginKey<DecorationSet>('split-breaks');

// The nodes that hold pages' content, walked down to it.
const CONTAINERS = new Set(['page_section', 'page']);

/** The hook class on a hidden break at a fragment's start. */
const SPLIT_BREAK = 'de-split-break';

// The hard breaks continued textblocks start with inside a block at `pos`.
function breaksIn(block: ProseMirrorNode, pos: number, found: Decoration[]) {
  const mark = (node: ProseMirrorNode, at: number) => {
    const continued = Number(node.attrs.splitPartIndex ?? 0) > 0;
    if (continued && node.firstChild?.type.name === 'hard_break') {
      found.push(Decoration.node(at + 1, at + 2, { class: SPLIT_BREAK }));
    }
  };
  if (block.isTextblock) return mark(block, pos);
  block.descendants((node, offset) => {
    if (node.isTextblock) mark(node, pos + 1 + offset);
    return !node.isTextblock && !node.isInline;
  });
}

// The breaks every page's first block starts its later fragments with: only a page's first block
// continues one, and in it the first textblock, or each column's in a continued layout section,
// as the layout engine starts no line with any of them.
function splitBreaks(doc: ProseMirrorNode): DecorationSet {
  const found: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'page_content') return CONTAINERS.has(node.type.name);
    if (node.firstChild) breaksIn(node.firstChild, pos + 1, found);
    return false;
  });
  return found.length ? DecorationSet.create(doc, found) : DecorationSet.empty;
}

/** Marks the hard break each later fragment of a split paragraph starts with. */
export function splitBreaksPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: splitBreaksKey,
    state: {
      init: (_config, state) => splitBreaks(state.doc),
      apply: (tr, set) => (tr.docChanged ? splitBreaks(tr.doc) : set),
    },
    props: { decorations: (state) => splitBreaksKey.getState(state) },
  });
}
