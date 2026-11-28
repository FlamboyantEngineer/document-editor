// What the pages read from their text layout engine (`text-engine.ts`), which loads only when the
// editor's `textLayout: 'pretext'` option is on, so the types live apart from it.

import type { MeasureContext } from '@chenglou/pretext';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import type { TypesetMath } from '../engine/math-typeset.js';
import type { FontFiles } from '../host/font-files.js';
import type { ContentsDrawn, ObjectBox } from '../layout-engine/blocks/types.js';
import type { SuggestionMarkup } from '../layout-engine/hidden-suggestions.js';
import type { InsertedText } from '../layout-engine/inserted-text.js';
import type { LineTable } from '../layout-engine/line-table.js';
import type { MathLayouter, PlacedMath } from '../layout-engine/math-atoms.js';
import type { ParagraphNumber } from '../layout-engine/numbers.js';
import type { ReserveCluster, ReservedBox } from '../layout-engine/reserved-boxes.js';
import type { SizedBox } from '../layout-engine/rule-sizes.js';
import type { LayoutBlock, LayoutRules, TemplateFile } from '../model/index.js';
import type { InsertedTexts } from './inserted-texts.js';
import type { LayoutInputs } from './layout-inputs.js';

/** How the editor lays its text out: measured in the DOM, or computed by the layout engine. */
export type TextLayoutMode = 'dom' | 'pretext';

/** What the pages' text layout engine is made from. */
export interface TextEngineOptions {
  readonly template: TemplateFile;
  /** Where text widths come from; by default a Canvas measuring unhinted (geometricPrecision). */
  readonly measureContext?: (() => MeasureContext) | undefined;
  /** Whether a family has served faces; a block in another family is left to the DOM. */
  readonly isFontServed?: ((family: string) => boolean) | undefined;
  /** The width a cluster the width source cannot measure takes, such as the font-file measurer's. */
  readonly reserve?: ReserveCluster | undefined;
  /** Told the characters of math the math layouter has no glyph for (DOCE-PAGINATION-12.9). */
  readonly missing?: ((text: string) => void) | undefined;
  /** The served faces the widths come from, which every drawing of the pages draws with. */
  readonly fonts?: (() => FontFiles) | undefined;
  /** Whether code blocks are drawn with a gutter of line numbers, which takes their width. */
  readonly codeLineNumbers?: boolean | undefined;
  /**
   * The language the pages are drawn in, which lines break and text is shaped by
   * (DOCE-PAGINATION-9.7): the document's own, else its template's (DOCE-PAGINATION-9.16); the
   * template's, else `en`, when not given. Never the host page's.
   */
  readonly language?: string | undefined;
  /**
   * The state the pages are laid out from, whose math views typeset its math
   * (DOCE-PAGINATION-10.8) and whose plugin lists its contents.
   */
  readonly state?: (() => EditorState | null) | undefined;
  /**
   * The node types a host draws with node views of its own, never laid out as text: one its rule
   * does not size takes no room.
   */
  readonly hostViews?: readonly string[] | undefined;
  /**
   * The layout rules now, the library's own (`LAYOUT_RULES`) when not given: a node whose rule has
   * `size` is laid out at that size (DOCE-PAGINATION-14.1).
   */
  readonly layoutRules?: (() => LayoutRules | undefined) | undefined;
  /** The text atoms not laid out as text, with why; `REFUSED_TEXT_ATOMS` by default. */
  readonly refusedTextAtoms?: ReadonlyMap<string, string> | undefined;
  /**
   * How the pages show suggestions now: the suggestions the markup hides take no room
   * (DOCE-PAGINATION-11.12). All shown when absent.
   */
  readonly markup?: (() => SuggestionMarkup) | undefined;
  /**
   * Lays typeset math out from a math font's data (DOCE-PAGINATION-12.10), so its box and drawing
   * come from one layout on every system; null while there is none. Math takes the reserved box
   * without it, or without `typesetOf` (DOCE-PAGINATION-12.9).
   */
  readonly mathLayouter?: (() => MathLayouter | null) | undefined;
  /** What a math node was typeset as, by the math views the pages draw with. */
  readonly typesetOf?: ((node: ProseMirrorNode) => TypesetMath | null) | undefined;
}

/** A text block's place on the pages. */
interface LinesPlace {
  /** The template section its page is in; null for the template's own scope. */
  readonly scope: string | null;
  /** Text before its content on its first line, such as a heading's number. */
  readonly prefix?: string | undefined;
  /** A numbered paragraph's number, drawn in a box before its first line. */
  readonly number?: ParagraphNumber | undefined;
  /** Words drawn in it that are not its content, such as a comparison's deleted words. */
  readonly inserted?: readonly InsertedText[] | undefined;
}

/** Inputs to a container layout that come from the pages' document. */
export interface NestedLinesPlace {
  readonly labelOf?: ((caption: ProseMirrorNode) => string | undefined) | undefined;
  readonly inserted?: InsertedTexts | undefined;
}

/** A text block's lines as the pages draw them, and whether it justifies them. */
export interface DrawnLines extends LineTable {
  readonly justify: boolean;
}

/** A document's numbered blocks, by position. */
interface DocumentNumbering {
  /** Each numbered heading's number with its space. */
  readonly headings: ReadonlyMap<number, string>;
  /** The numbered paragraphs, which the browser still draws on its own lines. */
  readonly paragraphs: ReadonlySet<number>;
  /** A caption's label, as this document's captions show them (`captionNumbers`). */
  readonly labelOf?: ((caption: ProseMirrorNode) => string | undefined) | undefined;
  /** Every caption's label in order, as one key. */
  readonly labelsKey?: string | undefined;
}

/** What the engine laid out, and could not, so far. */
export interface TextEngineStats {
  readonly laid: number;
  /** Nodes it could not lay out, each taking no room (DOCE-PAGINATION-14.4). */
  readonly refused: number;
  /** Why nodes could not be laid out, with how many. */
  readonly reasons: ReadonlyMap<string, number>;
  /**
   * The last nodes it could not lay out, at most 100, by their type and element id (`type#id`),
   * with why.
   */
  readonly refusedNodes?: ReadonlyMap<string, string> | undefined;
  /** How many equations are scaled to fit below `MATH_MIN_REPORTED_SCALE`. */
  readonly smallMath?: number | undefined;
  /**
   * The errors the host's layout rules gave instead of a size, by node type; their nodes take no
   * room (DOCE-PAGINATION-14.1).
   */
  readonly sizeErrors?: ReadonlyMap<string, string> | undefined;
}

/** A page header's, footer's or footnote area's height, its gap to the content and its children. */
export interface RegionRoom {
  /** Its height; 0 for an empty region, which the page does not draw. */
  readonly height: number;
  /** The space between it and the page's content. */
  readonly gap: number;
  /** Where each block or entry sits, from the first one's top. */
  readonly children: readonly { readonly top: number; readonly bottom: number }[];
}

/** The pages' text layout engine for one template. */
export interface PagesTextEngine {
  readonly template: TemplateFile;
  /** The served faces the engine measured with (DOCE-HOST-1.14.1); none with another width source. */
  readonly fonts?: (() => FontFiles) | undefined;
  /** The language the engine was made to lay the pages out in (DOCE-PAGINATION-9.7). */
  readonly language?: string | undefined;
  /** The layout inputs the engine records (DOCE-PAGINATION-13.12). */
  inputs(): LayoutInputs;
  /** Counts the measured document's numbered headings and paragraphs, for `measureBlock`. */
  number(doc: ProseMirrorNode): void;
  /** A document's numbered headings and paragraphs, such as the pages'. */
  numbering(doc: ProseMirrorNode): DocumentNumbering;
  /**
   * Keeps room in each list of contents row's page box for the digits of a page count, at least 3
   * (DOCE-PAGINATION-10.11), and gives that number of digits.
   */
  pageDigits(count: number): number;
  /** How the pages draw a list of contents block; null when the engine left it to the DOM. */
  contentsDrawn(
    node: ProseMirrorNode,
    scope: string | null,
    inserted?: InsertedTexts,
  ): ContentsDrawn | null;
  /**
   * A top-level block of a section's page content, laid out with the words inserted in its text
   * blocks; one it cannot lay out takes no room, counted in its stats.
   */
  measureBlock(node: ProseMirrorNode, scope: string | null, inserted?: InsertedTexts): LayoutBlock;
  /**
   * A section's page header, footer or footnote area, laid out with the text its template variables
   * show (none when absent, so a region with one is left to the DOM); null when the DOM must
   * measure it.
   */
  measureRegion(
    node: ProseMirrorNode,
    scope: string | null,
    variables?: ReadonlyMap<string, string>,
  ): RegionRoom | null;
  /**
   * The clusters of a word drawn in a text block that is not its content, such as a comparison's
   * deleted word, that take a reserved width in the block's font, by offset in the word.
   */
  insertedReserved(node: ProseMirrorNode, scope: string | null, word: string): ReservedBox[];
  /**
   * The lines of each text block in a page's header or footer, as the engine lays the region out
   * with the texts its template variables show; none when it cannot lay the region out.
   */
  regionLines(
    node: ProseMirrorNode,
    scope: string | null,
    variables?: ReadonlyMap<string, string>,
  ): ReadonlyMap<ProseMirrorNode, DrawnLines>;
  /** The lines of a top-level paragraph or heading on a page; null when the engine cannot. */
  lines(node: ProseMirrorNode, place: LinesPlace): DrawnLines | null;
  /**
   * The lines of each text block inside a top-level container of a page, such as a table's cells'
   * paragraphs, as the engine lays the container out in its section's content width; none when it
   * cannot lay the container out. Its captions show `labelOf`'s labels, as the pages' own copies of
   * the parts of a split table or code block do; the measured document's by default.
   */
  nestedLines(
    container: ProseMirrorNode,
    scope: string | null,
    place?: NestedLinesPlace,
  ): ReadonlyMap<ProseMirrorNode, DrawnLines>;
  /**
   * The box of each figure and table in a top-level block of a page's content, as the engine lays
   * the block out in its section's content width (DOCE-PAGINATION-10.12); none it cannot lay out.
   */
  objectBoxes(
    block: ProseMirrorNode,
    scope: string | null,
    inserted?: InsertedTexts,
  ): ReadonlyMap<ProseMirrorNode, ObjectBox>;
  /**
   * Whether the math layouter still loads what laying a document's math out needs, such as glyph
   * ranges: a promise that settles once it has, which the pages wait for before they lay the
   * document out (DOCE-PAGINATION-14.4); null when nothing is to load.
   */
  mathPending(doc: ProseMirrorNode): Promise<void> | null;
  /**
   * The layout a math node was laid out from, with the box and scale it takes on the pages
   * (DOCE-PAGINATION-12.10); null for math it has not laid out.
   */
  mathOf(node: ProseMirrorNode): PlacedMath | null;
  /**
   * A count that moves whenever the measured document is numbered with other footnote numbers, as
   * an edit renumbers them, so what was drawn with the old numbers is drawn again
   * (DOCE-PAGINATION-10.7).
   */
  numbersVersion?(): number;
  /** A count that moves whenever a math node is placed anew or the placements are forgotten. */
  mathVersion?(): number;
  /**
   * A count that moves once math the engine gave a provisional reserved box, before its typeset
   * answer or while its glyphs loaded, can be laid out from its layout; the engine then forgets
   * what it kept laid out with it, and what drew it draws it again (DOCE-PAGINATION-12.13).
   */
  atomsVersion?(): number;
  /** Whether a host's layout rule sizes a node's type (DOCE-PAGINATION-14.1). */
  sizedType?(node: ProseMirrorNode): boolean;
  /**
   * The box a node a host's rule sized was laid out at, which it is drawn in
   * (DOCE-PAGINATION-14.2); null for any other node and one not laid out yet.
   */
  objectOf?(node: ProseMirrorNode): SizedBox | null;
  /** A count that moves whenever a sized node is laid out at another box. */
  objectsVersion?(): number;
  stats(): TextEngineStats;
  destroy(): void;
}
