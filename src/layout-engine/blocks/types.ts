// What block geometry reads and returns. The text layout it reads is the engine's (thread G's
// `TextLayout`); only the part block geometry uses is named here, so either side can grow.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { ChildLayout, LayoutBlock } from '../../model/index.js';
import type { AtomCache } from '../atoms.js';
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
  /** A footnote entry's number (`blockNumbers`); an entry without one is laid out without it. */
  readonly footnoteOf?: ((entry: ProseMirrorNode) => string | undefined) | undefined;
}

/** Block geometry. */
export interface BlockLayout {
  /** A block's height, margins and the measurement its split reads. */
  layoutBlock(node: ProseMirrorNode, place: BlockPlace): BlockGeometry;
  /** A page header's, footer's or footnote area's height, gap and children. */
  layoutRegion(node: ProseMirrorNode, place: Omit<BlockPlace, 'region'>): RegionGeometry;
}
