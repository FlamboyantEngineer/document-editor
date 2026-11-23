// The text layout engine's lists of contents: their rows, titles and empty messages, in the same
// line cache and struts as the engine's blocks (DOCE-PAGINATION-9.13, 9.14).

import {
  ceilUnit,
  type ContentsRow,
  type ContentsRowPlace,
  type ContentsRowTable,
  layoutContentsText,
  layoutRow,
} from './contents-row.js';
import {
  type ContentsTextRole,
  contentsTextTypography,
  contentsTypography,
} from './contents-typography.js';
import type { LineTable } from './line-table.js';
import type { LineCache } from './lines.js';
import { type createStruts, textWidth } from './metrics.js';
import {
  type BlockTypography,
  firstFamily,
  fontString,
  type FontStyle,
  type TypographySource,
} from './typography.js';

/** A list of contents row's lines and boxes, or why the engine cannot lay it out. */
type ContentsRowLayout =
  | ({ readonly ok: true; readonly font: FontStyle } & ContentsRowTable)
  | { readonly ok: false; readonly reason: string };

/** A list of contents' title or empty message on lines, or why the engine cannot lay it out. */
type ContentsTextLayout =
  | { readonly ok: true; readonly font: FontStyle; readonly table: LineTable }
  | { readonly ok: false; readonly reason: string };

/** Where a list of contents' title or empty message is laid out: its content box's width. */
interface ContentsTextPlace {
  readonly width: number;
  readonly kind: string;
  readonly scope?: string | null | undefined;
  readonly role: ContentsTextRole;
}

/** Which list of contents level's font a text is in. */
interface ContentsLevel {
  readonly kind: string;
  readonly level: number;
  readonly scope?: string | null | undefined;
}

/** How the text layout engine lays a list of contents' text out. */
export interface ContentsLayout {
  /** A list of contents row's lines, number, leader and page (DOCE-PAGINATION-9.13). */
  readonly layoutContentsRow: (row: ContentsRow, place: ContentsRowPlace) => ContentsRowLayout;
  /** A text's width in a list of contents level's font, as its row sizes it, such as a page's. */
  readonly contentsTextWidth: (text: string, level: ContentsLevel) => number;
  /** A list of contents' title or empty message on lines (DOCE-PAGINATION-9.14). */
  readonly layoutContentsText: (text: string, place: ContentsTextPlace) => ContentsTextLayout;
}

/** What the engine lays a list of contents out with: its line cache, struts and fonts. */
interface ContentsEngine extends TypographySource {
  readonly cache: LineCache;
  readonly strutOf: ReturnType<typeof createStruts>;
  readonly isFontServed?: ((family: string) => boolean) | undefined;
}

/** The engine's list of contents layout. */
export function createContentsLayout({
  cache,
  strutOf,
  template,
  fontStacks,
  isFontServed,
}: ContentsEngine): ContentsLayout {
  const source = { template, fontStacks };
  const refused = (style: BlockTypography) => {
    const family = firstFamily(style.font.family);
    return isFontServed && !isFontServed(family)
      ? { ok: false as const, reason: `font not served: ${family}` }
      : null;
  };
  const engineOf = (style: BlockTypography) => ({
    cache,
    typography: style,
    strut: strutOf(fontString(style.font), style.font.size, style.leading),
    measure: textWidth,
  });
  return {
    layoutContentsText(text, place) {
      const style = contentsTextTypography(place, source);
      const refusal = refused(style);
      if (refusal) return refusal;
      return {
        ok: true,
        font: style.font,
        table: layoutContentsText(engineOf(style), text, place.width),
      };
    },
    contentsTextWidth: (text, level) =>
      ceilUnit(textWidth(text, fontString(contentsTypography(level, source).font))),
    layoutContentsRow(row, place) {
      const level = contentsTypography({ ...place, level: row.level }, source);
      // A group heading row is bold; its margin is the block geometry's.
      const style = row.heading ? { ...level, font: { ...level.font, weight: 700 } } : level;
      const refusal = refused(style);
      if (refusal) return refusal;
      return { ok: true, font: style.font, ...layoutRow(engineOf(style), row, place) };
    },
  };
}
