// The pages holding the selection's ends (DOCE-PAGINATION-11.6) carry `data-selection-page`, so the
// reference stylesheet never has them skip their layout. In a page that skips its layout the
// browser moves a selection the editor wrote to that page's first text, so a block selected on a
// page off screen, as a menu selects the whole of a split atom, would be read back as a caret there.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Plugin, PluginKey, type Selection } from 'prosemirror-state';
import { type Decoration, DecorationSet } from 'prosemirror-view';
import { viewOnlyNode } from '../utils/view-only-decorations.js';

const SELECTION_PAGE = { 'data-selection-page': 'true' };

// Where a page that holds a position starts and ends; null outside every page.
function pageAround(doc: ProseMirrorNode, pos: number): { from: number; to: number } | null {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name !== 'page') continue;
    const from = $pos.before(depth);
    return { from, to: from + $pos.node(depth).nodeSize };
  }
  return null;
}

interface SelectionPages {
  readonly doc: ProseMirrorNode;
  readonly key: string;
  readonly decorations: DecorationSet;
}

function selectionPages(doc: ProseMirrorNode, selection: Selection): SelectionPages {
  const pages = [pageAround(doc, selection.anchor), pageAround(doc, selection.head)];
  const ranges = pages.filter(
    (page, index): page is { from: number; to: number } =>
      page !== null && pages.findIndex((other) => other?.from === page.from) === index,
  );
  const decorations: Decoration[] = ranges.map((range) => viewOnlyNode(range, SELECTION_PAGE));
  return {
    doc,
    key: ranges.map((range) => String(range.from)).join(' '),
    decorations: DecorationSet.create(doc, decorations),
  };
}

const selectionPagesKey = new PluginKey<SelectionPages>('selection-pages');

/** A projection plugin marking the pages that hold the selection's ends. */
export function selectionPagesPlugin(): Plugin<SelectionPages> {
  return new Plugin<SelectionPages>({
    key: selectionPagesKey,
    state: {
      init: (_config, state) => selectionPages(state.doc, state.selection),
      apply(tr, value) {
        if (!tr.docChanged && !tr.selectionSet) return value;
        const next = selectionPages(tr.doc, tr.selection);
        // A selection moved on the same pages keeps the decorations; an edit or a layout, which
        // can replace a page, has them made again.
        return next.key === value.key && !tr.docChanged ? value : next;
      },
    },
    props: {
      decorations: (state) => selectionPagesKey.getState(state)?.decorations,
    },
  });
}
