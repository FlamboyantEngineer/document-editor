// The text layout engine: a text block's lines from its template typography, without the DOM.
// The editor, the viewer and print read the same line tables, so a block breaks its lines in the
// same places wherever it is drawn (DOCE-PAGINATION-9).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { TemplateFile } from '../model/format/template-format.js';
import type { TextMeasurement } from '../model/pagination/text-split.js';
import type { FontStacks } from '../model/templates/template-text-properties.js';
import type { BodyVariables } from './body-variables.js';
import { type ContentsLayout, createContentsLayout } from './contents-layout.js';
import { footnoteMarkerItem } from './footnote-marker.js';
import type { InsertedText } from './inserted-text.js';
import type { LineTable } from './line-table.js';
import { type CacheStats, createLineCache, layoutLines } from './lines.js';
import type { MathRecorder } from './math-atoms.js';
import { createStruts, type MetricsContext, textWidth } from './metrics.js';
import { type ParagraphNumber, placeNumber } from './numbers.js';
import { type ReserveCluster, type ReservedBox, reservedBoxes } from './reserved-boxes.js';
import { buildRuns, type MeasureAtom, type TextRun, type VariableTexts } from './runs.js';
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
  /** Told each math node laid out from its layout, with the box and scale it takes. */
  readonly onMath?: MathRecorder | undefined;
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
   * Whether the text is drawn hinted, as Chromium draws text at a ratio of 1 unless
   * `text-rendering: geometricPrecision` asks otherwise. Pages never are (DOCE-PAGINATION-11.1);
   * a lab that draws hinted text says so.
   */
  readonly hinted?: boolean | undefined;
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
  /**
   * The suggestion mark the pages' markup hides now (`hiddenSuggestion`), whose content takes no
   * room (DOCE-PAGINATION-11.12); none hidden when absent.
   */
  readonly hidden?: (() => string | null) | undefined;
  /**
   * What the template variables of a block in a page's body show (DOCE-PAGINATION-11.13); such a
   * block is refused without it, unless its place gives the variables' texts.
   */
  readonly bodyVariables?: BodyVariables | undefined;
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
  /** The text its template variables show, where it is drawn once with known values. */
  readonly variables?: VariableTexts | undefined;
  /**
   * Whether it is in a page's header or footer, whose variables show the page's own values: only
   * `variables` gives them, and it is refused without them.
   */
  readonly inRegion?: boolean | undefined;
  /** Text drawn in the block that is not its content, such as a comparison's deleted words. */
  readonly inserted?: readonly InsertedText[] | undefined;
  /** A caption's label, number and separator, drawn before its text in the caption label font. */
  readonly label?: string | undefined;
}

/** A block's line table, or why the engine cannot lay it out. */
export type TextBlockLayout =
  | { readonly ok: true; readonly table: LineTable }
  | { readonly ok: false; readonly reason: string };

/** A text layout engine for one template, language and set of fonts. */
export interface TextLayout extends ContentsLayout {
  /** A text block's typography in a scope. */
  readonly typography: (node: ProseMirrorNode, scope?: string | null) => BlockTypography;
  /**
   * The clusters of a word drawn in a text block that is not its content, such as a comparison's
   * deleted word, that take a reserved width in the block's font, by offset in the word.
   */
  readonly insertedReserved: (
    node: ProseMirrorNode,
    scope: string | null,
    word: string,
  ) => ReservedBox[];
  /** A text block's lines at a width. */
  readonly layoutText: (node: ProseMirrorNode, place: TextBlockPlace) => TextBlockLayout;
  /** A text's width in a block's font, such as a display equation's automatic number. */
  readonly textWidth: (text: string, node: ProseMirrorNode, scope?: string | null) => number;
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
  'code_caption',
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
  {
    isFontServed,
    marker,
  }: { isFontServed: ((family: string) => boolean) | undefined; marker?: string | undefined },
): string | null {
  if (!isFontServed) return null;
  const families = [typography.font.family];
  if (hasCode(node)) families.push(typography.codeFamily);
  if (marker) families.push(marker);
  return families.map(firstFamily).find((family) => !isFontServed(family)) ?? null;
}

// The clusters of a block's text items that take a reserved width; inserted words and a template
// variable's text are not the block's content, so they are left out: an inserted word's element
// draws its own boxes (`insertedReserved`, DOCE-PAGINATION-12.4).
function reservedOf(runs: readonly TextRun[], reserve: ReserveCluster): ReservedBox[] {
  const boxes: ReservedBox[] = [];
  for (const run of runs)
    run.items.forEach((item, index) => {
      const offset = run.offsets[index] ?? -1;
      const inserted = (run.sides[index] ?? null) !== null;
      if (offset < 0 || inserted || !('font' in item) || item.break === 'never') return;
      boxes.push(...reservedBoxes(item.text, { offset, font: item.font, reserve }));
    });
  return boxes;
}

// A line table with the reserved clusters of its runs, when the measurer reserves any.
// A line table with the boxes its page variables are drawn in, too (DOCE-PAGINATION-11.13).
function withReserved(
  table: LineTable,
  { runs, boxes }: { runs: readonly TextRun[]; boxes: readonly ReservedBox[] },
  reserve: ReserveCluster | undefined,
): LineTable {
  const clusters = reserve ? reservedOf(runs, reserve) : [];
  const reserved = [...boxes, ...clusters].sort((a, b) => a.from - b.from);
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
): { firstStart: number; restStart: number; lead?: number | undefined; inset?: number } {
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
  return { firstStart: gutter, restStart: gutter, inset: gutter };
}

// The reserved boxes of a word drawn in a text block that is not its content, in the block's font.
const insertedReservedIn =
  (typography: TextLayout['typography'], reserve: ReserveCluster | undefined) =>
  (node: ProseMirrorNode, scope: string | null, word: string): ReservedBox[] => {
    const font = fontString(typography(node, scope).font);
    return reserve ? reservedBoxes(word, { offset: 0, font, reserve }) : [];
  };

// Text in another font takes its own font's box at the line height it inherits, as an inline box
// in Chromium's line does; the line grows to hold the tallest. The boxes are kept by font.
function fontBoxes(strutOf: ReturnType<typeof createStruts>) {
  const boxes = new Map<string, { width: number; height: number; baseline: number }>();
  return (style: BlockTypography) => (font: FontStyle) => {
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
}

/** A text layout engine. Prepared text is kept between calls, so laying a block out again is cheap. */
export function createTextLayout(options: TextLayoutOptions): TextLayout {
  const cache = createLineCache(options.language);
  const strutOf = createStruts({
    context: options.measureContext,
    scale: options.scale,
    hinted: options.hinted,
  });
  const boxOf = fontBoxes(strutOf);
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
    insertedReserved: insertedReservedIn(typography, options.reserve),
    textWidth: (text, node, scope) => textWidth(text, fontString(typography(node, scope).font)),
    stats: cache.stats,
    ...createContentsLayout({ ...options, cache, strutOf }),
    layoutText(node, place) {
      if (!TEXT_BLOCKS.has(node.type.name))
        return { ok: false, reason: `not a text block: ${node.type.name}` };
      const style = typography(node, place.scope);
      const marker = leadingItem(node, style, place);
      const unserved = unservedFamily(node, style, {
        isFontServed: options.isFontServed,
        marker: marker?.family,
      });
      if (unserved) return { ok: false, reason: `font not served: ${unserved}` };
      const font = fontString(style.font);
      const starts = lineStarts(node, { style, place, codeLineNumbers: options.codeLineNumbers });
      const lineWidth = Math.max(1, place.width - 2 * style.padding);
      const runs = buildRuns({
        node,
        typography: style,
        prefix: marker?.item ?? place.prefix,
        lead: starts.lead,
        measureAtom: options.measureAtom,
        lineWidth,
        onMath: options.onMath,
        scope: place.scope,
        textAtoms: options.textAtoms,
        variables: place.variables,
        bodyVariables: place.inRegion ? undefined : options.bodyVariables,
        boxOf: boxOf(style),
        inserted: place.inserted,
        hidden: options.hidden?.(),
      });
      if (!runs.ok) return runs;
      const table = layoutLines(cache, {
        runs: runs.runs,
        width: lineWidth,
        leading: style.leading,
        strut: strutOf(font, style.font.size, style.leading),
        align: style.align,
        padding: style.padding,
        firstStart: starts.firstStart,
        restStart: starts.restStart,
        block: node,
      });
      const inset = starts.inset ? { inset: starts.inset } : {};
      const laid = { ...table, ...inset, ...(runs.hidden.length ? { hidden: runs.hidden } : {}) };
      return { ok: true, table: withReserved(laid, runs, options.reserve) };
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
