// A template variable's value as the pages draw and lay it out, word by word (DOCE-PAGINATION-9.5):
// each word with the white space after it is an element of its own inside the variable, so a line
// can break between two words of the value and the forced lines draw that break between their
// elements, as among a comparison's inserted words (DOCE-PAGINATION-11.11).

/** One word of a variable's value, as it is drawn inside the variable. */
interface VariablePiece {
  /** The word with the white space after it; a line feed that ends it is drawn and breaks its line. */
  readonly text: string;
  /** Its place among the variable's elements, as an editor widget's `side`, going up by 2. */
  readonly side: number;
}

const WORDS = /\s*\S+\s*/gu;

/**
 * A variable's value in its pieces: its words, each with the white space after it up to a line
 * feed, which ends its piece; a value of white space alone is one piece, and each line its line
 * feeds leave empty is a piece of its line feed alone. Line feeds that end the value are left out,
 * as the browser would draw them only before other text.
 */
export function variablePieces(value: string): VariablePiece[] {
  const texts: string[] = [];
  const lines = value.replace(/\n+$/u, '').split('\n');
  lines.forEach((line, index) => {
    const words = line.match(WORDS) ?? (line ? [line] : []);
    const feed = index < lines.length - 1;
    if (!words.length) {
      if (feed) texts.push('\n');
      return;
    }
    // White space before the line's first word belongs to it.
    texts.push(...words.slice(0, -1), `${words.at(-1) ?? ''}${feed ? '\n' : ''}`);
  });
  return texts.map((text, index) => ({ text, side: 2 * index }));
}
