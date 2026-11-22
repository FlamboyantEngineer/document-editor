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

// The first textblock a page's content starts with, and where its content starts.
function firstTextblock(content: ProseMirrorNode, pos: number): [ProseMirrorNode, number] | null {
  let node = content;
  let start = pos + 1;
  while (!node.isTextblock) {
    const first = node.firstChild;
    if (!first || first.isInline) return null;
    node = first;
    start += 1;
  }
  return [node, start];
}

// The breaks every page's first fragment starts with; only a page's first block continues one.
function splitBreaks(doc: ProseMirrorNode): DecorationSet {
  const found: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'page_content') return CONTAINERS.has(node.type.name);
    const first = node.firstChild && firstTextblock(node.firstChild, pos + 1);
    if (!first) return false;
    const [block, start] = first;
    const continued = Number(block.attrs.splitPartIndex ?? 0) > 0;
    if (continued && block.firstChild?.type.name === 'hard_break') {
      found.push(Decoration.node(start, start + 1, { class: SPLIT_BREAK }));
    }
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
