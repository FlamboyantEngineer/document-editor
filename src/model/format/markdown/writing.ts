// What the Markdown writer carries while it writes a document: how it writes the suggestions, the
// values it shows, and the footnotes it has cited so far.

import type { SuggestionsMode } from '../left-out.js';
import type { WriterValues } from '../writer-values.js';

export interface Writing {
  readonly suggestions: SuggestionsMode;
  readonly values: WriterValues;
  /** The footnotes' definitions, in the order cited. */
  readonly footnotes: string[];
  /** Whether a table's cell is being written, where a pipe ends the cell even in code. */
  readonly inTable?: boolean;
  /** Whether a heading is being written, which is one line. */
  readonly inHeading?: boolean;
}

/** A stored value as text: a string as it is, anything else as none. */
export const text = (value: unknown): string => (typeof value === 'string' ? value : '');
