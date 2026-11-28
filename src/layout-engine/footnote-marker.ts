// A footnote entry's number as the engine lays it out: in the template's marker style, inside
// the entry's first line, followed by the numbering suffix and a quarter of the marker size,
// as the reference stylesheet draws `.pm-footnote-entry-number` and its `::after`.

import type { RichInlineItem } from '@chenglou/pretext/rich-inline';
import type { TemplateFile } from '../model/format/template-format.js';
import { resolveFontStack } from '../model/templates/template-css-values.js';
import { resolveFootnoteSettings } from '../model/templates/template-scopes.js';
import { findTemplateSection } from '../model/templates/template-sections.js';
import type { FontStacks } from '../model/templates/template-text-properties.js';
import { resolveSize } from './template-lengths.js';
import { type BlockTypography, fontString, snap } from './typography.js';

/** The marker size relative to the entry text, when the template sets none. */
const MARKER_SIZE = 0.85;
/** The marker weight when the template sets none. */
const MARKER_WEIGHT = 600;
/** The space after the suffix, in marker sizes. */
const MARKER_GAP = 0.25;

/** Where a footnote marker's style comes from. */
interface FootnoteMarkerSource {
  readonly template: TemplateFile;
  readonly fontStacks?: FontStacks | undefined;
  readonly scope?: string | null | undefined;
}

/** A footnote entry's number as Pretext lays it out, and the family it is drawn in. */
interface FootnoteMarker {
  readonly item: RichInlineItem;
  readonly family: string;
}

/**
 * A footnote entry's number as an item drawn before its content: the number and the template's
 * suffix in the marker font, with the space after it as extra width.
 */
export function footnoteMarkerItem(
  number: string,
  entry: BlockTypography,
  { template, fontStacks, scope }: FootnoteMarkerSource,
): FootnoteMarker {
  const section = scope ? findTemplateSection(template, scope) : null;
  const { marker, suffix } = resolveFootnoteSettings(template, section);
  const size = snap(resolveSize(marker.size, entry.font.size) ?? entry.font.size * MARKER_SIZE);
  const font = {
    family: resolveFontStack(marker.font, '', fontStacks) || entry.font.family,
    size,
    weight: typeof marker.weight === 'number' ? marker.weight : MARKER_WEIGHT,
    italic: marker.italic === true,
  };
  const item = {
    text: number + suffix,
    font: fontString(font),
    extraWidth: snap(size * MARKER_GAP),
  };
  return { item, family: font.family };
}
