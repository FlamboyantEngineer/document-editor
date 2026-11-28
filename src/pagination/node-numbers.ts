// A document's numbers by node, for the pages' text layout engine to lay its blocks out with: each
// heading's prefix, each numbered paragraph's number, each caption's label, each footnote's
// number and each display equation's, and the key a kept block's numbers must match (DOCE-PAGINATION-10.7, 11.1).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { idOf } from '../engine/footnote-model.js';
import { numberFootnoteParts } from '../engine/footnote-numbers.js';
import { captionNumbers } from '../layout-engine/blocks/numbers.js';
import { documentNumbers, type ParagraphNumber } from '../layout-engine/numbers.js';
import { resolveFootnoteSettings, type TemplateFile } from '../model/index.js';
import { blockLabelKeys } from './block-label-keys.js';
import { equationNumbers } from './equation-numbers.js';
import { typedTextPath } from './typed-text.js';

/** A document's numbers by node, for the blocks laid out next. */
export interface NodeNumbers {
  readonly doc: ProseMirrorNode | null;
  /**
   * What the numbers were counted for: the same for every document typed from the one numbered,
   * whose blocks' keys outside the typed block are unchanged (DOCE-PAGINATION-11.14).
   */
  readonly counted: object;
  /** A numbered heading's number and the space after it. */
  readonly prefixOf: (heading: ProseMirrorNode) => string | undefined;
  /** A numbered paragraph's number. */
  readonly paragraphOf: (paragraph: ProseMirrorNode) => ParagraphNumber | undefined;
  /** A caption's label (`captionNumbers`). */
  readonly labelOf: (caption: ProseMirrorNode) => string | undefined;
  /** A footnote marker's or entry's number, by its footnote's id. */
  readonly footnoteOf: (part: ProseMirrorNode) => string | undefined;
  /** A display equation's automatic number, such as `(3)`. */
  readonly equationOf: (equation: ProseMirrorNode) => string | undefined;
  /** The numbers as one key, which a kept block's must match. */
  readonly keyOf: (node: ProseMirrorNode) => string;
}

/** No numbers, before a document is numbered. */
const NO_NUMBERS: NodeNumbers = {
  doc: null,
  counted: {},
  prefixOf: () => undefined,
  paragraphOf: () => undefined,
  labelOf: () => undefined,
  footnoteOf: () => undefined,
  equationOf: () => undefined,
  keyOf: () => '',
};

// The number a footnote numbered on each page is laid out with: the room of one digit, as wide as
// CSS's `ch`, whatever its page draws (DOCE-PAGINATION-7.2). The measured document has no pages to
// number it by.
const PAGE_FOOTNOTE_ROOM = '0';

// Each footnote's number by its id, through the document as the state laid out numbers them, or
// the room of one digit when the pages number them on each page, and the numbers of the markers in
// each top-level block, in order, as the key a kept block's must match: a marker renumbered
// changes its width (DOCE-PAGINATION-10.7).
function footnotesOf(doc: ProseMirrorNode, perPage: boolean) {
  const byId = new Map<string, string>();
  const byBlock = new Map<ProseMirrorNode, string>();
  for (const part of numberFootnoteParts(doc, 'document')) {
    const { node, pos } = part;
    const number = perPage ? PAGE_FOOTNOTE_ROOM : String(part.number);
    const id = idOf(node);
    if (id !== null) byId.set(id, number);
    if (node.type.name !== 'footnote_reference') continue;
    const $pos = doc.resolve(pos);
    for (let depth = $pos.depth - 1; depth >= 0; depth -= 1) {
      if ($pos.node(depth).type.name !== 'page_content') continue;
      const block = $pos.node(depth + 1);
      byBlock.set(block, `${byBlock.get(block) ?? ''},${number}`);
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

// A node's own node in the document it was numbered in: itself, or the node a typed edit replaced
// (`typedTextPath`).
type NumberedAs = (node: ProseMirrorNode) => ProseMirrorNode;

// A paragraph's number as a key: its label, after a mark when it is a later part's.
const paragraphKey = (number: ParagraphNumber | undefined) =>
  number ? `${number.continued ? '+' : ''}${number.label}` : '';

/** A document's numbers by node, and its numbered headings and paragraphs. */
function numbersByNode(doc: ProseMirrorNode, template: TemplateFile) {
  const { headings, paragraphs } = documentNumbers(doc, template);
  const labels = captionNumbers(doc, template);
  const counted = {};
  const perPage = resolveFootnoteSettings(template).numbering === 'page';
  let footnotes: ReturnType<typeof footnotesOf> | null = null;
  const footnotesOnce = () => (footnotes ??= footnotesOf(doc, perPage));
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
  let equations: ReturnType<typeof equationNumbers> | null = null;
  const equationOf = (node: ProseMirrorNode) =>
    node.type.name === 'math_display'
      ? (equations ??= equationNumbers(doc, template)).of(node) || undefined
      : undefined;
  // Read when a block is laid out, including numbers of its unchanged descendant equations.
  let keys: ReadonlyMap<ProseMirrorNode, string> | null = null;
  const labelKey = (node: ProseMirrorNode) =>
    (keys ??= blockLabelKeys(doc, (child) => labels.labelOf(child) ?? equationOf(child))).get(
      node,
    ) ?? '';
  // The numbers of a document numbered as this one, its nodes found through `as`.
  const byNode = (shown: ProseMirrorNode, as: NumberedAs): NodeNumbers => {
    const footnotes = footnotesOnce();
    return {
      doc: shown,
      counted,
      prefixOf: (heading) => prefixes.get(as(heading)),
      paragraphOf: (paragraph) => numbered.get(as(paragraph)),
      labelOf: (caption) => labels.labelOf(as(caption)),
      footnoteOf: (part) => footnotes.byId.get(idOf(part) ?? ''),
      equationOf: (node) => equationOf(as(node)),
      keyOf: (node) => {
        const own = as(node);
        return `${prefixes.get(own) ?? paragraphKey(numbered.get(own))}|${footnotes.byBlock.get(own) ?? ''}|${labelKey(own)}`;
      },
    };
  };
  const numbering = {
    headings,
    paragraphs,
    labelOf: labels.labelOf,
    labelsKey: labels.labelsKey,
  };
  // Each footnote's number by its id, in the order the markers first cite them, as one key; none
  // when every footnote is laid out with the same room.
  const footnotesKey = () =>
    perPage ? '' : [...footnotesOnce().byId].map(([id, number]) => `${id}=${number}`).join(',');
  return { byNode, numbering, footnotesKey };
}

// The numbers counted for one document and the documents typed from it, whose nodes a typed edit
// replaced found again by the nodes they replaced (DOCE-PAGINATION-11.14).
interface Counted {
  readonly numbers: NodeNumbers;
  readonly found: ReturnType<typeof numbersByNode>;
  readonly replaced: WeakMap<ProseMirrorNode, ProseMirrorNode>;
}

const asCounted =
  (replaced: Counted['replaced']): NumberedAs =>
  (node) =>
    replaced.get(node) ?? node;

/** The measured document's numbers and the draw-only numbering of its projections. */
export function holdNodeNumbers(template: TemplateFile) {
  let counted: Counted | null = null;
  let footnotes = '';
  let version = 0;
  const drawn = new WeakMap<ProseMirrorNode, ReturnType<typeof numbersByNode>['numbering']>();
  // Numbers a document typed from the one numbered before through the nodes its edit replaced.
  const typedFrom = (doc: ProseMirrorNode, before: Counted): boolean => {
    const path = before.numbers.doc && typedTextPath(before.numbers.doc, doc);
    if (!path) return false;
    const { replaced, found } = before;
    for (const [node, was] of path) replaced.set(node, replaced.get(was) ?? was);
    counted = { ...before, numbers: found.byNode(doc, asCounted(replaced)) };
    return true;
  };
  return {
    current: () => counted?.numbers ?? NO_NUMBERS,
    /**
     * Moves whenever a document is numbered with other footnote numbers, or other stored variable
     * values, than the one before: the body's variables show the numbered document's values. A typed
     * edit keeps both, as its document has the same attributes.
     */
    version: () => version,
    number(doc: ProseMirrorNode) {
      if (counted?.numbers.doc === doc || (counted && typedFrom(doc, counted))) return;
      const found = numbersByNode(doc, template);
      const replaced = new WeakMap<ProseMirrorNode, ProseMirrorNode>();
      counted = { found, replaced, numbers: found.byNode(doc, asCounted(replaced)) };
      drawn.set(doc, found.numbering);
      const key = `${found.footnotesKey()}|${JSON.stringify(doc.attrs.values ?? null)}`;
      if (key !== footnotes) [footnotes, version] = [key, version + 1];
    },
    numbering(doc: ProseMirrorNode) {
      const numbering = drawn.get(doc) ?? numbersByNode(doc, template).numbering;
      drawn.set(doc, numbering);
      return numbering;
    },
  };
}
