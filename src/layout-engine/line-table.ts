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
  /**
   * Whether the line starts inside a word inserted at `from`, as a deleted word longer than the
   * line or broken at its hyphen, which no widget break can draw: the line starts at the word's
   * offset, in no content. The line marks do not draw such a line yet.
   */
  readonly inWord?: true | undefined;
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
  /**
   * The room before every line that the block's own box draws at its left content edge, such as a
   * code block's gutter of line numbers, which each line's `left` includes; absent when none.
   */
  readonly inset?: number | undefined;
  /** The clusters drawn in a box of a fixed width (`reserved-boxes.ts`); absent when none are. */
  readonly reserved?: readonly ReservedBox[] | undefined;
  /**
   * The content ranges laid out as taking no room, `[from, to)`, as the suggestions a markup hides
   * (DOCE-PAGINATION-11.12); absent when none are. The lines still tile the content, the hidden
   * ranges inside them, in content order and without overlap; what draws a line starts and ends
   * it at its first and last shown character.
   */
  readonly hidden?: readonly (readonly [number, number])[] | undefined;
  /**
   * The text the lines are laid out over when the block shows text it does not hold, as a later
   * part's caption shows the first part's text and the continued suffix: the lines' offsets are in
   * it (DOCE-PAGINATION-11.2); absent when the lines are of the block's content.
   */
  readonly text?: string | undefined;
  /**
   * A caption's label as the lines draw it when a line breaks inside it or right after it: the
   * label's part on each line it starts, each ending in a line feed but a last one that shares its
   * line with the content (DOCE-PAGINATION-11.2); absent when the content starts on the label's
   * line.
   */
  readonly label?: string | undefined;
  /**
   * The clusters of a heading's number or a caption's label that take a reserved width
   * (`reserved-boxes.ts`), by offset in that text: the pages draw such a number or label
   * themselves, each cluster in its box, and a caption's label is then in `label` even when the
   * content starts on its line; absent when none does.
   */
  readonly prefixReserved?: readonly ReservedBox[] | undefined;
}
