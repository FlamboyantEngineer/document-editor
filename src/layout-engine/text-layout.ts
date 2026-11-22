// The text layout engine: a text block's lines from its template typography, without the DOM.
// The editor, the viewer and print read the same line tables, so a block breaks its lines in the
// same places wherever it is drawn (DOCE-PAGINATION-9).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { TemplateFile } from '../model/format/template-format.js';
import type { TextMeasurement } from '../model/pagination/text-split.js';
import type { FontStacks } from '../model/templates/template-text-properties.js';
import { footnoteMarkerItem } from './footnote-marker.js';
import type { LineTable } from './line-table.js';
import { type CacheStats, createLineCache, layoutLines } from './lines.js';
import { createStruts, type MetricsContext, textWidth } from './metrics.js';
import { type ParagraphNumber, placeNumber } from './numbers.js';
import { type ReserveCluster, type ReservedBox, reservedBoxes } from './reserved-boxes.js';
import { buildRuns, type MeasureAtom, type TextRun } from './runs.js';
import {
  type BlockTypography,
  blockTypography,
  firstFamily,
  fontString,
  type FontStyle,
  snapLeading,
} from './typography.js';

/** What the engine lays text out from. */
export interface TextLayoutOptions {
  readonly template: TemplateFile;
  /** The font stacks of the families the host serves itself (`FontStacks`). */
  readonly fontStacks?: FontStacks | undefined;
  /** The document's language, which line breaking follows. */
  readonly language?: string | undefined;
  /** Whether a family is one the document's fonts serve; a block in another is refused. */
  readonly isFontServed?: ((family: string) => boolean) | undefined;
  /** Sizes the inline atoms the engine does not lay out as text. */
  readonly measureAtom?: MeasureAtom | undefined;
  /** The context font metrics are read from, such as the font files' measurer; a Canvas if not. */
  readonly measureContext?: MetricsContext | undefined;
  /**
   * The device pixel ratio font metrics are rounded at. The canonical layout is at 1, the default;
   * other ratios are for comparing with Chromium's own layout on a screen.
   */
  readonly scale?: number | undefined;
  /**
   * The width a cluster the measurer cannot measure reliably takes, such as the font-file
   * measurer's `reserve`; the line table lists those clusters for the renderers.
   */
  readonly reserve?: ReserveCluster | undefined;
}

/** Where a text block is laid out. */
export interface TextBlockPlace {
  /** The width the block gets, its padding included. */
  readonly width: number;
  /** The template section the block is in; the template's own scope when absent. */
  readonly scope?: string | null | undefined;
  /** Text drawn before the content on its first line, such as a heading's number and its space. */
  readonly prefix?: string | undefined;
  /** A numbered paragraph's number (`documentNumbers`), drawn in a box before its first line. */
  readonly number?: ParagraphNumber | undefined;
  /** A footnote entry's number, drawn before its content in the template's marker style. */
  readonly footnoteNumber?: string | undefined;
}

/** A block's line table, or why the engine cannot lay it out. */
export type TextBlockLayout =
  | { readonly ok: true; readonly table: LineTable }
  | { readonly ok: false; readonly reason: string };

/** A text layout engine for one template, language and set of fonts. */
interface TextLayout {
  /** A text block's typography in a scope. */
  readonly typography: (node: ProseMirrorNode, scope?: string | null) => BlockTypography;
  /** A text block's lines at a width. */
  readonly layoutText: (node: ProseMirrorNode, place: TextBlockPlace) => TextBlockLayout;
  /** How many text runs the engine found prepared, and how many it prepared. */
  readonly stats: () => CacheStats;
}

const TEXT_BLOCKS = new Set(['paragraph', 'heading', 'code_block', 'footnote_entry']);

function hasCode(node: ProseMirrorNode): boolean {
  let found = false;
  node.forEach((child) => {
    found ||= child.marks.some((mark) => mark.type.name === 'code');
  });
  return found;
}

function unservedFamily(
  node: ProseMirrorNode,
  typography: BlockTypography,
  { isFontServed, marker }: { isFontServed: (family: string) => boolean; marker?: string },
): string | null {
  const families = [typography.font.family];
  if (hasCode(node)) families.push(typography.codeFamily);
  if (marker) families.push(marker);
  return families.map(firstFamily).find((family) => !isFontServed(family)) ?? null;
}

// The clusters of a block's text items that take a reserved width; a template variable's text is
// not the block's content, so it is left out.
function reservedOf(runs: readonly TextRun[], reserve: ReserveCluster): ReservedBox[] {
  const boxes: ReservedBox[] = [];
  for (const run of runs)
    run.items.forEach((item, index) => {
      const offset = run.offsets[index] ?? -1;
      if (offset < 0 || !('font' in item) || item.break === 'never') return;
      boxes.push(...reservedBoxes(item.text, { offset, font: item.font, reserve }));
    });
  return boxes;
}

// A line table with the reserved clusters of its runs, when the measurer reserves any.
function withReserved(
  table: LineTable,
  runs: readonly TextRun[],
  reserve: ReserveCluster | undefined,
): LineTable {
  const reserved = reserve ? reservedOf(runs, reserve) : [];
  return reserved.length ? { ...table, reserved } : table;
}

/** A text layout engine. Prepared text is kept between calls, so laying a block out again is cheap. */
export function createTextLayout(options: TextLayoutOptions): TextLayout {
  const cache = createLineCache(options.language);
  const strutOf = createStruts({ context: options.measureContext, scale: options.scale });
  const boxes = new Map<string, { width: number; height: number; baseline: number }>();
  // Text in another font takes its own font's box at the line height it inherits, as an inline
  // box in Chromium's line does; the line grows to hold the tallest.
  const boxOf = (style: BlockTypography) => (font: FontStyle) => {
    const leading = snapLeading(font.size * style.lineHeight);
    const key = `${fontString(font)} ${String(leading)}`;
    let box = boxes.get(key);
    if (!box) {
      const strut = strutOf(fontString(font), font.size, leading);
      box = { width: 0, height: strut.ascent + strut.descent, baseline: strut.ascent };
      boxes.set(key, box);
    }
    return box;
  };
  const typography = (node: ProseMirrorNode, scope?: string | null) =>
    blockTypography(node, { template: options.template, fontStacks: options.fontStacks, scope });
  return {
    typography,
    stats: cache.stats,
    layoutText(node, place) {
      if (!TEXT_BLOCKS.has(node.type.name))
        return { ok: false, reason: `not a text block: ${node.type.name}` };
      const style = typography(node, place.scope);
      const marker =
        place.footnoteNumber === undefined
          ? null
          : footnoteMarkerItem(place.footnoteNumber, style, { ...options, scope: place.scope });
      const unserved = options.isFontServed
        ? unservedFamily(node, style, {
            isFontServed: options.isFontServed,
            ...(marker ? { marker: marker.family } : {}),
          })
        : null;
      if (unserved) return { ok: false, reason: `font not served: ${unserved}` };
      const font = fontString(style.font);
      const numbered = place.number
        ? placeNumber({
            number: place.number,
            size: style.font.size,
            indentation: style.indentation,
            measure: (text) => textWidth(text, font),
          })
        : null;
      const runs = buildRuns({
        node,
        typography: style,
        prefix: marker?.item ?? place.prefix,
        lead: numbered?.box,
        measureAtom: options.measureAtom,
        boxOf: boxOf(style),
      });
      if (!runs.ok) return runs;
      const table = layoutLines(cache, {
        runs: runs.runs,
        width: Math.max(1, place.width - 2 * style.padding),
        leading: style.leading,
        strut: strutOf(font, style.font.size, style.leading),
        align: style.align,
        padding: style.padding,
        firstStart: numbered?.firstStart ?? 0,
        restStart: numbered?.restStart ?? 0,
      });
      return { ok: true, table: withReserved(table, runs.runs, options.reserve) };
    },
  };
}

/**
 * A line table as the measurement the page packer's splitters read: the lines a range of the
 * block touches and their height. `offset` is where the fragment starts in the whole block.
 */
export function lineTableMeasurement(table: LineTable, offset = 0): TextMeasurement {
  return {
    offset,
    overhead: table.overhead,
    lines: table,
    measure(from, to) {
      const touched = table.lines.filter((line) =>
        from === to
          ? line.from <= from && from < Math.max(line.to, line.from + 1)
          : line.from < to && line.to > from,
      );
      const first = touched[0];
      const last = touched.at(-1);
      return {
        height: first && last ? last.top + last.height - first.top : 0,
        lines: touched.length,
      };
    },
  };
}
