// What block geometry reads and returns. The text layout it reads is the engine's (thread G's
// `TextLayout`); only the part block geometry uses is named here, so either side can grow.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { ChildLayout, LayoutBlock } from '../../model/index.js';
import type { AtomCache } from '../atoms.js';
import type { ContentsRow, ContentsRowPlace, ContentsRowTable } from '../contents-row.js';
import type { LineTable } from '../line-table.js';
import type { VariableTexts } from '../runs.js';
import type { TextBlockLayout, TextBlockPlace } from '../text-layout.js';
import type { BlockTypography } from '../typography.js';
import type { BlockMetrics } from './metrics.js';

/**
 * The part of the text layout engine (`TextLayout`) block geometry reads: a text block's margins
 * and its line table. The engine is one; a test may stand in for it.
 */
export interface BlockTextLayout {
  typography(
    node: ProseMirrorNode,
    scope?: string | null,
  ): Pick<BlockTypography, 'marginTop' | 'marginBottom'>;
  layoutText(node: ProseMirrorNode, place: TextBlockPlace): TextBlockLayout;
  /** A list of contents row's lines and boxes; a list is left to the DOM without it. */
  layoutContentsRow?(row: ContentsRow, place: ContentsRowPlace): ContentsRowLayout;
  /** A text's width in a list of contents level's font, as its row sizes it. */
  contentsTextWidth?(text: string, level: ContentsTextLevel): number;
  /** A list of contents' title or empty message on lines; a list is left to the DOM without it. */
  layoutContentsText?(text: string, place: ContentsTextPlace): ContentsTextLayout;
}

/** A list of contents row laid out, or why it cannot be. */
export type ContentsRowLayout =
  ({ readonly ok: true } & ContentsRowTable) | { readonly ok: false; readonly reason: string };

/** Which list of contents level's font a text is in. */
interface ContentsTextLevel {
  readonly kind: string;
  readonly level: number;
  readonly scope?: string | null | undefined;
}

/** Where a list of contents' title or empty message is laid out. */
export interface ContentsTextPlace {
  readonly width: number;
  readonly kind: string;
  readonly scope?: string | null | undefined;
  readonly role: 'title' | 'empty';
}

/** A list of contents' title or empty message on lines, or why it cannot be. */
export type ContentsTextLayout =
  | { readonly ok: true; readonly table: LineTable }
  | { readonly ok: false; readonly reason: string };

/** One row a list of contents shows. */
export interface ContentsListEntry {
  /** Its level, 1 to 6; a group heading's 0 is drawn as level 1. */
  readonly level: number;
  readonly number: string;
  readonly text: string;
  /** Whether it is a group's heading, drawn bold and without a page. */
  readonly heading?: boolean | undefined;
}

/** What a list of contents block shows, as its node view draws it. */
export interface ContentsList {
  /** Its kind (`toc`, `figures` or a host's), whose template settings it takes. */
  readonly kind: string;
  /** Its title, or null when it shows none, as a split list's later parts. */
  readonly title: string | null;
  /** What it shows when it lists nothing, under its title; null when it lists something. */
  readonly empty: string | null;
  /** The rows it shows, in order. */
  readonly entries: readonly ContentsListEntry[];
  /** The text between an entry's number and its text. */
  readonly separator: string;
  readonly showPage: boolean;
  /** Whether each level, from level 1, draws a leader before its page. */
  readonly leaders: readonly boolean[];
}

/** How the pages draw a list of contents block. */
export interface ContentsDrawn {
  /** Each level's page box width in CSS pixels, from level 1; null where rows show no page. */
  readonly pageWidths: readonly (number | null)[];
  /** Where each row's text starts each of its lines, by offset in its text. */
  readonly rows: readonly (readonly number[])[];
}

/** Which part of a page a block is laid out in; a header's and a footer's blocks take no margins. */
type BlockRegion = 'content' | 'header' | 'footer';

/** Where a block is laid out. */
export interface BlockPlace {
  /** The content width it gets. */
  readonly width: number;
  /** The template section it is in; null or none for the template's own scope. */
  readonly scope?: string | null | undefined;
  readonly region?: BlockRegion | undefined;
  /** The text its template variables show, for a header or footer drawn with known values. */
  readonly variables?: VariableTexts | undefined;
}

/** A block laid out without the DOM, in the shape the page layout reads. */
export type BlockGeometry =
  | {
      readonly ok: true;
      readonly block: LayoutBlock;
      /** Whether an atom in it still loads, so its size may change. */
      readonly provisional: boolean;
    }
  | {
      readonly ok: false;
      /** The node the engine cannot lay out yet, and why. */
      readonly node: ProseMirrorNode;
      readonly reason: string;
    };

/** A page header, footer or footnote area laid out without the DOM. */
export type RegionGeometry =
  | {
      readonly ok: true;
      /** Its height; 0 for an empty region, which the page does not draw. */
      readonly height: number;
      /** The space between it and the page's content. */
      readonly gap: number;
      /** Where each block or entry sits, from the first one's top. */
      readonly children: readonly ChildLayout[];
      readonly provisional: boolean;
    }
  | { readonly ok: false; readonly node: ProseMirrorNode; readonly reason: string };

/** What block geometry is computed from. */
export interface BlockLayoutOptions {
  readonly text: BlockTextLayout;
  readonly atoms: AtomCache;
  /** The template's numbers in a scope (`blockMetrics`). */
  readonly metrics: (scope: string | null) => BlockMetrics;
  /** The label a caption's line starts with, such as `Table 1.2 - `; none by default. */
  readonly labelOf?: ((caption: ProseMirrorNode) => string | undefined) | undefined;
  /** A footnote entry's number (`numbersByNode`); an entry without one is laid out without it. */
  readonly footnoteOf?: ((entry: ProseMirrorNode) => string | undefined) | undefined;
  /** What a list of contents block shows; a list without it is left to the DOM. */
  readonly contentsOf?: ((node: ProseMirrorNode) => ContentsList | undefined) | undefined;
  /**
   * How many digits a list of contents keeps room for in each page number (DOCE-PAGINATION-10.11):
   * every row's page box is this many of its font's `0`, whatever its page reads; 3 by default.
   */
  readonly pageDigits?: (() => number) | undefined;
}

/** Block geometry. */
export interface BlockLayout {
  /** A block's height, margins and the measurement its split reads. */
  layoutBlock(node: ProseMirrorNode, place: BlockPlace): BlockGeometry;
  /** A page header's, footer's or footnote area's height, gap and children. */
  layoutRegion(node: ProseMirrorNode, place: Omit<BlockPlace, 'region'>): RegionGeometry;
}
