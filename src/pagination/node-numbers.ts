// A document's numbers by node, for the pages' text layout engine to lay its blocks out with: each
// heading's prefix, each numbered paragraph's number, each caption's label and each footnote's
// number, and the key a kept block's numbers must match (DOCE-PAGINATION-10.7, 11.1).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { idOf } from '../engine/footnote-model.js';
import { numberFootnoteParts } from '../engine/footnote-numbers.js';
import { captionNumbers } from '../layout-engine/blocks/numbers.js';
import { documentNumbers, type ParagraphNumber } from '../layout-engine/numbers.js';
import type { TemplateFile } from '../model/index.js';
import { captionLabelKeys } from './caption-label-keys.js';

/** A document's numbers by node, for the blocks laid out next. */
export interface NodeNumbers {
  readonly doc: ProseMirrorNode | null;
  readonly prefixes: ReadonlyMap<ProseMirrorNode, string>;
  readonly paragraphs: ReadonlyMap<ProseMirrorNode, ParagraphNumber>;
  /** A caption's label (`captionNumbers`). */
  readonly labelOf: (caption: ProseMirrorNode) => string | undefined;
  /** A footnote marker's or entry's number, by its footnote's id. */
  readonly footnoteOf: (part: ProseMirrorNode) => string | undefined;
  /** The numbers as one key, which a kept block's must match. */
  readonly keyOf: (node: ProseMirrorNode) => string;
}

/** No numbers, before a document is numbered. */
export const NO_NUMBERS: NodeNumbers = {
  doc: null,
  prefixes: new Map(),
  paragraphs: new Map(),
  labelOf: () => undefined,
  footnoteOf: () => undefined,
  keyOf: () => '',
};

// Each footnote's number by its id, through the document as the measuring view numbers them, and
// the numbers of the markers in each top-level block, in order, as the key a kept block's must
// match: a marker renumbered changes its width (DOCE-PAGINATION-10.7).
function footnotesOf(doc: ProseMirrorNode) {
  const byId = new Map<string, string>();
  const byBlock = new Map<ProseMirrorNode, string>();
  for (const { node, pos, number } of numberFootnoteParts(doc, 'document')) {
    const id = idOf(node);
    if (id !== null) byId.set(id, String(number));
    if (node.type.name !== 'footnote_reference') continue;
    const $pos = doc.resolve(pos);
    for (let depth = $pos.depth - 1; depth >= 0; depth -= 1) {
      if ($pos.node(depth).type.name !== 'page_content') continue;
      const block = $pos.node(depth + 1);
      byBlock.set(block, `${byBlock.get(block) ?? ''},${String(number)}`);
      break;
    }
  }
  return { byId, byBlock };
}

/** The numbers of the footnote markers a text block holds, as a key. */
export function markerKey(node: ProseMirrorNode, footnoteOf: NodeNumbers['footnoteOf']): string {
  let key = '';
  node.forEach((child) => {
    if (child.type.name === 'footnote_reference') key += `,${footnoteOf(child) ?? ''}`;
  });
  return key;
}

/** A document's numbers by node, and its numbered headings and paragraphs. */
export function numbersByNode(doc: ProseMirrorNode, template: TemplateFile) {
  const { headings, paragraphs } = documentNumbers(doc, template);
  const prefixes = new Map<ProseMirrorNode, string>();
  const numbered = new Map<ProseMirrorNode, ParagraphNumber>();
  for (const [pos, prefix] of headings) {
    const node = doc.nodeAt(pos);
    if (node) prefixes.set(node, prefix);
  }
  for (const [pos, number] of paragraphs) {
    const node = doc.nodeAt(pos);
    if (node) numbered.set(node, number);
  }
  const labels = captionNumbers(doc, template);
  const footnotes = footnotesOf(doc);
  const footnoteOf = (part: ProseMirrorNode) => footnotes.byId.get(idOf(part) ?? '');
  // Read when a block is laid out, not for the numbering the pages draw on every change.
  let captions: ReadonlyMap<ProseMirrorNode, string> | null = null;
  const captionKey = (node: ProseMirrorNode) =>
    (captions ??= captionLabelKeys(doc, (caption) => labels.labelOf(caption))).get(node) ?? '';
  const byNode: NodeNumbers = {
    doc,
    prefixes,
    paragraphs: numbered,
    labelOf: (caption) => labels.labelOf(caption),
    footnoteOf,
    keyOf: (node) =>
      `${prefixes.get(node) ?? numbered.get(node)?.label ?? ''}|${footnotes.byBlock.get(node) ?? ''}|${captionKey(node)}`,
  };
  const numbering = {
    headings,
    paragraphs: new Set(paragraphs.keys()),
    labelOf: byNode.labelOf,
    labelsKey: labels.labelsKey,
  };
  return { byNode, numbering };
}
