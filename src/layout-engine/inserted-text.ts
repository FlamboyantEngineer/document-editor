// Text a block draws that is not its content, such as the words a version comparison shows deleted
// where they were: laid out on the block's lines at a content offset, word by word, each word an
// element of its own, so a line can break between two words and the renderer can draw that break
// between their elements (DOCE-PAGINATION-11.11).

/** Words drawn at a content offset of a block, before the content there. */
export interface InsertedText {
  /** The content offset the words are drawn at. */
  readonly offset: number;
  /** The words, each with the white space after it, in order. */
  readonly pieces: readonly string[];
  /**
   * Each word's place among the elements drawn at the offset, as an editor widget's `side`; a
   * break between two words is drawn between them.
   */
  readonly sides: readonly number[];
  /**
   * Whether the words are drawn on lines of their own, before the block's content or after it, as
   * a deleted block's text is; a break the source draws separates them from the content.
   */
  readonly alone?: 'before' | 'after' | undefined;
}

/** The inserted text of a block as a key: blocks laid out with different text differ. */
export const insertedKey = (inserted: readonly InsertedText[] | undefined): string =>
  inserted?.length
    ? inserted
        .map((each) => `${String(each.offset)}${each.alone ?? ''}:${each.pieces.join('')}`)
        .join('|')
    : '';
