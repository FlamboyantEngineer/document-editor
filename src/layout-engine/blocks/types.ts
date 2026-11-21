// What block geometry reads and returns. The text layout it reads is the engine's (thread G's
// `TextLayout`); only the part block geometry uses is named here, so either side can grow.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { ChildLayout, LayoutBlock } from '../../model/index.js';
import type { AtomCache } from '../atoms.js';
import type { BlockMetrics } from './metrics.js';

/** A text block's lines as the text layout engine laid them out. */
export interface TextLines {
  readonly lines: readonly { readonly from: number; readonly height: number }[];
  /** The lines together, without padding or margins. */
  readonly height: number;
  /** The height beyond the lines, such as a code block's padding. */
  readonly overhead: number;
}

/** Where a text block is laid out. */
interface TextPlace {
  readonly width: number;
  readonly scope?: string | null | undefined;
  /** Text before the content on the first line, such as a caption's label. */
  readonly prefix?: string | undefined;
}

/** The part of the text layout engine block geometry reads. */
export interface BlockTextLayout {
  typography(
    node: ProseMirrorNode,
    scope?: string | null,
  ): { readonly marginTop: number; readonly marginBottom: number };
  layoutText(
    node: ProseMirrorNode,
    place: TextPlace,
  ):
    | { readonly ok: true; readonly table: TextLines }
    | { readonly ok: false; readonly reason: string };
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
}

/** Block geometry. */
export interface BlockLayout {
  /** A block's height, margins and the measurement its split reads. */
  layoutBlock(node: ProseMirrorNode, place: BlockPlace): BlockGeometry;
  /** A page header's, footer's or footnote area's height, gap and children. */
  layoutRegion(node: ProseMirrorNode, place: Omit<BlockPlace, 'region'>): RegionGeometry;
}
