// The parts of a citation that identify what it cites, its document's number, its revision and its
// target's number, each kept as one unbreakable part (`data-reference-identifier`), so a line
// breaks in a citation's title but never inside `PWR-100`, `Rev B` or `Table 2.1`.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { readReferenceBaseline } from '../model/index.js';
import { touchesReferences } from './reference-updates.js';
import { internalTargetId, listReferences } from './references.js';

const identifiersKey = new PluginKey<DecorationSet>('reference-identifiers');

// Each identifier a citation reads, by where it first reads in its text.
function identifiersOf(text: string, parts: readonly (string | null | undefined)[]) {
  const found: [number, number][] = [];
  for (const part of parts) {
    const value = part?.trim();
    const at = value ? text.indexOf(value) : -1;
    if (value && at >= 0) found.push([at, at + value.length]);
  }
  return found;
}

/** The marks that keep each citation's identifiers whole, for a document. */
export function referenceIdentifiers(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  for (const reference of listReferences(doc)) {
    if (internalTargetId(reference.mark)) continue;
    const baseline = readReferenceBaseline(reference.mark.attrs.referenceBaseline);
    if (!baseline) continue;
    const text = doc.textBetween(reference.from, reference.to);
    const parts = [baseline.numbering, baseline.revisionLabel, baseline.target?.numbering];
    for (const [from, to] of identifiersOf(text, parts)) {
      decorations.push(
        Decoration.inline(reference.from + from, reference.from + to, {
          'data-reference-identifier': '',
        }),
      );
    }
  }
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
