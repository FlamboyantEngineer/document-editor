// What the pages read from their text layout engine (`text-engine.ts`), which loads only when the
// editor's `textLayout: 'pretext'` option is on, so the types live apart from it.

import type { MeasureContext } from '@chenglou/pretext';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import type { FontFiles } from '../host/font-files.js';
import type { SuggestionMarkup } from '../layout-engine/hidden-suggestions.js';
import type { InsertedText } from '../layout-engine/inserted-text.js';
import type { LineTable } from '../layout-engine/line-table.js';
import type { ParagraphNumber } from '../layout-engine/numbers.js';
import type { ReserveCluster, ReservedBox } from '../layout-engine/reserved-boxes.js';
import type { LayoutBlock, TemplateFile } from '../model/index.js';
import type { InsertedTexts } from './inserted-texts.js';

/** How the editor lays its text out: measured in the DOM, or computed by the layout engine. */
export type TextLayoutMode = 'dom' | 'pretext';

/** What the pages' text layout engine is made from. */
export interface TextEngineOptions {
  readonly template: TemplateFile;
  /** Where atoms only the browser can size are measured, out of sight. */
  readonly measureIn: HTMLElement;
  /** Called when atoms that were still loading have their final sizes. */
  readonly onAtomsSettled: () => void;
  /** Where text widths come from; by default a Canvas measuring unhinted (geometricPrecision). */
  readonly measureContext?: (() => MeasureContext) | undefined;
  /** Whether a family has served faces; a block in another family is left to the DOM. */
  readonly isFontServed?: ((family: string) => boolean) | undefined;
  /** The width a cluster the width source cannot measure takes, such as the font-file measurer's. */
  readonly reserve?: ReserveCluster | undefined;
  /** The served faces the widths come from, which every drawing of the pages draws with. */
  readonly fonts?: (() => FontFiles) | undefined;
  /** Whether code blocks are drawn with a gutter of line numbers, which takes their width. */
  readonly codeLineNumbers?: boolean | undefined;
  /**
   * The language the pages are drawn in, which lines break and text is shaped by
   * (DOCE-PAGINATION-9.7): the `lang` of the element they are in, empty for none, which Chromium
   * lays out under its default language.
   */
  readonly language?: string | undefined;
  /**
   * The view that measures the pages, which draws each atom as the pages do; atoms are measured as
   * it draws them (DOCE-PAGINATION-10.2). Without it, an atom is drawn in a host of its own.
   */
  readonly view?: (() => EditorView | null) | undefined;
  /** How much that view is scaled on screen, such as by a zoom. */
  readonly scale?: (() => number) | undefined;
  /** The node types a host draws with node views of its own, measured as drawn, never as text. */
  readonly hostViews?: readonly string[] | undefined;
  /** The text atoms left to the DOM, with why; `REFUSED_TEXT_ATOMS` by default. */
  readonly refusedTextAtoms?: ReadonlyMap<string, string> | undefined;
  /**
   * How the pages show suggestions now: the suggestions the markup hides take no room
   * (DOCE-PAGINATION-11.12). All shown when absent.
   */
  readonly markup?: (() => SuggestionMarkup) | undefined;
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
}

/** What the engine laid out and left to the DOM so far. */
export interface TextEngineStats {
  readonly laid: number;
  readonly refused: number;
  /** Why blocks were left to the DOM, with how many. */
  readonly reasons: ReadonlyMap<string, number>;
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
  /** The language the engine was made to lay the pages out in (DOCE-PAGINATION-9.7), empty for none. */
  readonly language?: string | undefined;
  /** Counts the measured document's numbered headings and paragraphs, for `measureBlock`. */
  number(doc: ProseMirrorNode): void;
  /** A document's numbered headings and paragraphs, such as the pages'. */
  numbering(doc: ProseMirrorNode): DocumentNumbering;
  /**
   * A top-level block of a section's page content, laid out with the words inserted in its text
   * blocks; null when the DOM must measure it.
   */
  measureBlock(
    node: ProseMirrorNode,
    scope: string | null,
    inserted?: InsertedTexts,
  ): LayoutBlock | null;
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
   * cannot lay the container out.
   */
  nestedLines(
    container: ProseMirrorNode,
    scope: string | null,
  ): ReadonlyMap<ProseMirrorNode, DrawnLines>;
  /**
   * Whether an atom the engine measured, such as an image or math, still waits for its final size,
   * so the blocks holding it, and the page breaks after them, may move.
   */
  provisional(): boolean;
  stats(): TextEngineStats;
  destroy(): void;
}
