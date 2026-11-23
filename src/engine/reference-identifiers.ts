// The parts of a citation that identify what it cites, its document's number, its revision and its
// target's number, each kept as one unbreakable part (`data-reference-identifier`), so a line
// breaks in a citation's title but never inside `PWR-100`, `Rev B` or `Table 2.1`.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { citationIdentifiers } from '../model/citation-identifiers.js';
import { touchesReferences } from './reference-updates.js';

const identifiersKey = new PluginKey<DecorationSet>('reference-identifiers');

/** The marks that keep each citation's identifiers whole, for a document. */
export function referenceIdentifiers(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    for (const [from, to] of citationIdentifiers(node, pos + 1))
      decorations.push(Decoration.inline(from, to, { 'data-reference-identifier': '' }));
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

/**
 * Marks the identifiers of the document's citations, which a line could break inside at a space or
 * a hyphen, as one unbreakable part each (`data-reference-identifier`), for a stylesheet to keep
 * whole (DOCE-REFERENCES-1.13).
 */
export function createReferenceIdentifiers(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: identifiersKey,
    state: {
      init: (_config, state) => referenceIdentifiers(state.doc),
      apply: (tr, value) =>
        touchesReferences(tr) ? referenceIdentifiers(tr.doc) : value.map(tr.mapping, tr.doc),
    },
    props: { decorations: (state) => identifiersKey.getState(state) ?? null },
  });
}
