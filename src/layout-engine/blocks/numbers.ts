// The numbers a document shows that CSS counters would draw: caption labels, ordered list markers
// and footnote numbers. A page out of view is not drawn (`content-visibility: auto`), so a counter
// there counts nothing; the engine counts them instead, from the document and its template, and
// lays them out and draws them as text (DOCE-PAGINATION-10.7). Heading and paragraph numbers come
// from the text layout engine's own numbering.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type FootnoteNumbering, numberFootnoteParts } from '../../engine/footnote-numbers.js';
import type { ContentsKind } from '../../model/contents/contents-kinds.js';
import { catalogDocument } from '../../model/contents/document-catalog.js';
import type { TemplateFile, TemplateStyles } from '../../model/format/template-format.js';
import { formatCounterValue, parseNumberingStyle } from '../../model/numbering/numbering-format.js';
import { captionNodeOf } from '../../model/schema/caption-content.js';
import { documentSections } from '../../model/schema/document-structure.js';
import { templateScopeStyles } from '../../model/templates/template-properties.js';
import { findTemplateSection } from '../../model/templates/template-sections.js';

/** The numbers of one document, by node. */
export interface BlockNumbers {
  /** A caption's label and the ` - ` after it, as the label line draws it; none when it shows none. */
  labelOf(caption: ProseMirrorNode): string | undefined;
  /** An ordered list item's marker, its space after included; none for any other node. */
  markerOf(item: ProseMirrorNode): string | undefined;
  /** A footnote marker's or entry's number; none for a footnote no marker in its scope cites. */
  footnoteOf(part: ProseMirrorNode): string | undefined;
}

/** How a document's numbers are counted. */
interface BlockNumbersOptions {
  /** How footnotes are numbered: through the document by default. */
  readonly footnotes?: FootnoteNumbering | undefined;
}

// What a caption label adds after its number (`::before { content: … ' - ' }`).
const LABEL_SEPARATOR = ' - ';

// Every captioned object, whether its caption shows or not; one that shows none gets no label.
const CAPTIONED: Readonly<Record<string, ContentsKind>> = {
  figures: { nodes: ['figure'] },
  tables: { nodes: ['table'] },
  code: { nodes: ['code_block'] },
};

function captionLabels(doc: ProseMirrorNode, template: TemplateFile) {
  const labels = new Map<ProseMirrorNode, string>();
  const catalog = catalogDocument(doc, template, CAPTIONED);
  for (const entry of Object.values(catalog).flat()) {
    const $pos = doc.resolve(entry.pos);
    const object = $pos.nodeAfter;
    if (!object || object.attrs.captionEnabled === false || !entry.number) continue;
    const caption = captionNodeOf(object, $pos.parent);
    if (caption) labels.set(caption, entry.number + LABEL_SEPARATOR);
  }
  return labels;
}

/**
 * An ordered list's marker for its count, as the stylesheet's `::marker` content draws it: the
 * template's list format (or heading 1's) with its prefix and suffix, else `1. `.
 */
function markerFormat(styles: TemplateStyles): (count: number) => string {
  const list = styles.list;
  const format = list?.format || styles.heading1?.numbering?.format?.trim();
  if (!list || (!format && !list.prefix && !list.suffix)) return (count) => `${String(count)}. `;
  const level = parseNumberingStyle(format || '1.').levels[0] ?? { token: '1', separator: '.' };
  const prefix = list.prefix ?? '';
  const suffix = list.suffix ?? '';
  return (count) =>
    `${prefix}${formatCounterValue(count, level.token)}${level.separator}${suffix} `;
}

function listMarkers(doc: ProseMirrorNode, template: TemplateFile) {
  const markers = new Map<ProseMirrorNode, string>();
  for (const section of documentSections(doc)) {
    const styles = templateScopeStyles(template, findTemplateSection(template, section.name));
    const marker = markerFormat(styles);
    section.node.descendants((node) => {
      if (node.isTextblock) return false;
      if (node.type.name !== 'ordered_list') return true;
      const start = Number(node.attrs.order ?? 1);
      node.forEach((item, _offset, index) => {
        markers.set(item, marker((Number.isFinite(start) ? start : 1) + index));
      });
      return true;
    });
  }
  return markers;
}

function footnoteNumbers(doc: ProseMirrorNode, numbering: FootnoteNumbering) {
  const numbers = new Map<ProseMirrorNode, string>();
  for (const { node, number } of numberFootnoteParts(doc, numbering)) {
    numbers.set(node, String(number));
  }
  return numbers;
}

/**
 * The caption labels, ordered list markers and footnote numbers of a document under its template,
 * each section by its own scope. Nodes are found by identity, so ask with the nodes of this `doc`.
 */
export function blockNumbers(
  doc: ProseMirrorNode,
  template: TemplateFile,
  { footnotes = 'document' }: BlockNumbersOptions = {},
): BlockNumbers {
  const labels = captionLabels(doc, template);
  const markers = listMarkers(doc, template);
  const numbers = footnoteNumbers(doc, footnotes);
  return {
    labelOf: (caption) => labels.get(caption),
    markerOf: (item) => markers.get(item),
    footnoteOf: (part) => numbers.get(part),
  };
}
