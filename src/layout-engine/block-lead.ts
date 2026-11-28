// What a text block draws before its content in a font of its own, a footnote entry's number or a
// caption's label, and how the pages draw a heading's number or a caption's label with the
// clusters of a reserved width it holds (DOCE-PAGINATION-12.4).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type FootnoteMarker, footnoteMarkerItem } from './footnote-marker.js';
import type { LineTable } from './line-table.js';
import { type ReserveCluster, type ReservedBox, reservedBoxes } from './reserved-boxes.js';
import type { TextBlockPlace, TextLayoutOptions } from './text-layout.js';
import { type BlockTypography, captionLabelFont, fontString } from './typography.js';

/** What a block draws before its content in a font of its own, or null. */
type Marker = FootnoteMarker | null;

/**
 * What a block draws before its content in a font of its own: a footnote entry's number, or a
 * caption's label.
 */
export function leadingItem(
  node: ProseMirrorNode,
  style: BlockTypography,
  { options, place }: { options: TextLayoutOptions; place: TextBlockPlace },
): Marker {
  const source = { ...options, scope: place.scope };
  if (place.footnoteNumber !== undefined)
    return footnoteMarkerItem(place.footnoteNumber, style, source);
  const font = place.label ? captionLabelFont(node, style, source) : null;
  return font && place.label
    ? { item: { text: place.label, font: fontString(font) }, family: font.family }
    : null;
}

/**
 * The clusters of what a heading draws before its content (its number) or a caption (its label)
 * that take a reserved width, by offset in that text (DOCE-PAGINATION-12.4). A footnote entry's
 * number is drawn by the stylesheet, which nothing reaches inside, and is left out.
 */
export function leadReserved(
  place: TextBlockPlace,
  { marker, font, reserve }: { marker: Marker; font: string; reserve: ReserveCluster | undefined },
): ReservedBox[] {
  if (!reserve || place.footnoteNumber !== undefined) return [];
  const lead = place.label ? marker?.item : place.prefix ? { text: place.prefix, font } : null;
  return lead ? reservedBoxes(lead.text, { offset: 0, font: lead.font, reserve }) : [];
}

/**
 * The text the pages draw before a block's content in its parts (`LineTable.label`): a caption's
 * label, and a heading's number that holds a cluster of a reserved width, which the stylesheet's
 * generated content cannot draw in its box; the item in the first run before which only a
 * numbered paragraph's box is.
 */
export function labelInput(
  place: TextBlockPlace,
  {
    marker,
    boxes,
    lead,
  }: { marker: Marker; boxes: readonly ReservedBox[]; lead?: number | undefined },
): { label?: { item: number; text: string } } {
  if (place.footnoteNumber !== undefined) return {};
  if (marker && place.label) return { label: { item: lead ? 1 : 0, text: place.label } };
  if (boxes.length && place.prefix) return { label: { item: 0, text: place.prefix } };
  return {};
}

/**
 * A line table with its label's reserved clusters: such a label is drawn by the pages, with its
 * boxes, even when the content starts on its line.
 */
export function withLabelBoxes(
  table: LineTable,
  { boxes, label }: { boxes: readonly ReservedBox[]; label: string | undefined },
): LineTable {
  if (!boxes.length) return table;
  return { ...table, prefixReserved: boxes, label: table.label ?? label };
}
