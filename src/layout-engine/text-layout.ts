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
import type { TextAtomSource } from './text-atoms.js';
import {
  type BlockTypography,
  blockTypography,
  captionLabelFont,
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
  /**
   * The inline atoms the engine lays out as their text (`TEXT_ATOMS` by default, less those a host
   * draws itself), and the footnote markers' numbers.
   */
  readonly textAtoms?: TextAtoms | undefined;
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
  /**
   * Whether code blocks show a gutter of line numbers, as the object views draw them by default;
   * the gutter takes the code's width in from its left.
   */
  readonly codeLineNumbers?: boolean | undefined;
}

/** The inline atoms laid out as their text, and their numbers. */
type TextAtoms = TextAtomSource & { readonly types?: ReadonlySet<string> | undefined };

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
  /** A caption's label, number and separator, drawn before its text in the caption label font. */
  readonly label?: string | undefined;
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

const TEXT_BLOCKS = new Set([
  'paragraph',
  'heading',
  'code_block',
  'footnote_entry',
  'figure_caption',
  'table_caption',
]);

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

/** The fewest digits a code gutter is wide for, and the room beside them (`document.css`). */
const GUTTER_DIGITS = 3;
const GUTTER_ROOM = 6 + 8;

/**
 * The width a code block's gutter of line numbers takes from its text: as many widths of the code
 * font's zero as its highest number has digits, at least three, and 14px more, truncated to the
 * layout unit as Chromium's padding is.
 */
function codeGutterWidth(node: ProseMirrorNode, font: string): number {
  const start = Number(node.attrs.codeLineStart);
  const first = Number.isInteger(start) && start > 0 ? start : 1;
  const last = first + node.textContent.split('\n').length - 1;
  const digits = Math.max(GUTTER_DIGITS, String(last).length);
  return Math.floor((digits * textWidth('0', font) + GUTTER_ROOM) * 64) / 64;
}

// Where a block's lines start from its left content edge: a numbered paragraph's first line at its
// number's box and the others at its text position, a code block's beside its gutter.
function lineStarts(
  node: ProseMirrorNode,
  input: { style: BlockTypography; place: TextBlockPlace; codeLineNumbers: boolean | undefined },
): { firstStart: number; restStart: number; lead?: number | undefined } {
  const { style, place } = input;
  const font = fontString(style.font);
  if (place.number) {
    const numbered = placeNumber({
      number: place.number,
      size: style.font.size,
      indentation: style.indentation,
      measure: (text) => textWidth(text, font),
    });
    return { firstStart: numbered.firstStart, restStart: numbered.restStart, lead: numbered.box };
  }
  const gutter =
    input.codeLineNumbers && node.type.name === 'code_block' ? codeGutterWidth(node, font) : 0;
  return { firstStart: gutter, restStart: gutter };
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
  // What a block draws before its content in a font of its own: a footnote entry's number, or a
  // caption's label.
  const leadingItem = (node: ProseMirrorNode, style: BlockTypography, place: TextBlockPlace) => {
    const source = { ...options, scope: place.scope };
    if (place.footnoteNumber !== undefined)
      return footnoteMarkerItem(place.footnoteNumber, style, source);
    const font = place.label ? captionLabelFont(node, style, source) : null;
    return font && place.label
      ? { item: { text: place.label, font: fontString(font) }, family: font.family }
      : null;
  };
  return {
    typography,
    stats: cache.stats,
    layoutText(node, place) {
      // A code caption waits for code figure geometry that matches the drawn box (DOCE-PAGINATION-9.11).
      if (node.type.name === 'code_caption')
        return { ok: false, reason: 'a code caption is left to its code figure in the DOM' };
      if (!TEXT_BLOCKS.has(node.type.name))
        return { ok: false, reason: `not a text block: ${node.type.name}` };
      const style = typography(node, place.scope);
      const marker = leadingItem(node, style, place);
      const unserved = options.isFontServed
        ? unservedFamily(node, style, {
            isFontServed: options.isFontServed,
            ...(marker ? { marker: marker.family } : {}),
          })
        : null;
      if (unserved) return { ok: false, reason: `font not served: ${unserved}` };
      const font = fontString(style.font);
      const starts = lineStarts(node, { style, place, codeLineNumbers: options.codeLineNumbers });
      const runs = buildRuns({
        node,
        typography: style,
        prefix: marker?.item ?? place.prefix,
        lead: starts.lead,
        measureAtom: options.measureAtom,
        scope: place.scope,
        textAtoms: options.textAtoms,
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
        firstStart: starts.firstStart,
        restStart: starts.restStart,
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
