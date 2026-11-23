// The line table: what the text layout engine says about one text block, and the contract every
// reader of a layout shares. The page packer splits paragraphs at its line starts, block geometry
// stacks its heights, and the renderer draws exactly these lines, breaking at each line's start, so
// calculation, editing, the viewer and print agree by construction.

import type { ReservedBox } from './reserved-boxes.js';

/** How a line ends. */
type TextLineEnd = 'wrap' | 'break' | 'end';

/** One line of a text block, in CSS pixels at a zoom of 1. */
export interface TextLine {
  /** The content offset in the block where the line starts. */
  readonly from: number;
  /** The content offset where the next line starts; the block's content size for its last line. */
  readonly to: number;
  /** The width the line's content takes, leaving out spaces that hang past its end. */
  readonly width: number;
  /** Where the line's content starts from the block's left content edge, after indentation and alignment. */
  readonly left: number;
  /** Where the line box starts from the top of the block's first line. */
  readonly top: number;
  /** The line box's height. */
  readonly height: number;
  /** Whether the line wraps, ends at a hard break, or ends the block. */
  readonly end: TextLineEnd;
  /**
   * For a line that starts among text inserted at `from` (`InsertedText`), such as a deleted word
   * a comparison draws: the side its break is drawn at, between the inserted elements there.
   */
  readonly side?: number | undefined;
}

/** A text block's lines at one width. Lines tile the content: each starts where the one before ends. */
export interface LineTable {
  /** The content width the lines were laid out to. */
  readonly width: number;
  /** The lines, at least one, even for an empty block. */
  readonly lines: readonly TextLine[];
  /** The height of the lines together, without the block's padding or margins. */
  readonly height: number;
  /** The height the block takes beyond its lines, such as a code block's padding. */
  readonly overhead: number;
  /** The clusters drawn in a box of a fixed width (`reserved-boxes.ts`); absent when none are. */
  readonly reserved?: readonly ReservedBox[] | undefined;
}
