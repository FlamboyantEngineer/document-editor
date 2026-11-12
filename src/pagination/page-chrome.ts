// The page chrome a section repeats on each of its pages after the first: its header and footer,
// hidden from assistive technology, so a screen reader reads each section's header and footer once
// rather than on every page.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

const REPEATED = new Set(['page_header', 'page_footer']);
const HIDDEN = { 'aria-hidden': 'true' };

// The decorations of each projection document, made once.
const drawn = new WeakMap<ProseMirrorNode, DecorationSet>();

// Hides the header and footer of every page of a section after its first.
function repeatedChrome(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.forEach((section, sectionPos) => {
    section.forEach((page, pageOffset, pageIndex) => {
      if (pageIndex === 0 || page.type.name !== 'page') return;
      const pagePos = sectionPos + 1 + pageOffset;
      page.forEach((region, regionOffset) => {
        if (!REPEATED.has(region.type.name)) return;
        const from = pagePos + 1 + regionOffset;
        decorations.push(Decoration.node(from, from + region.nodeSize, HIDDEN));
      });
    });
  });
  return DecorationSet.create(doc, decorations);
}

/** A projection plugin hiding the header and footer each section repeats on its later pages. */
export function pageChromeDecorations(): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const known = drawn.get(state.doc);
        if (known) return known;
        const set = repeatedChrome(state.doc);
        drawn.set(state.doc, set);
        return set;
      },
    },
  });
}
