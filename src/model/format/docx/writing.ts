// The state the writer carries through a document: how it writes suggestions and values, the
// numbering and comments it records, the links of the part it is writing, and its footnotes.

import type { SuggestionsMode } from '../left-out.js';
import type { WriterValues } from '../writer-values.js';
import type { WordComments } from './comments.js';
import type { Counting } from './counting.js';

/** What the writer carries through a document. */
export interface Writing {
  readonly suggestions: SuggestionsMode;
  readonly values: WriterValues;
  /** The addresses the part being written links to, in the order of their relationships. */
  readonly links: string[];
  /** Each footnote's runs, by its number from 1. */
  readonly footnotes: string[];
  /** The addresses the footnotes part links to. */
  readonly footnoteLinks: string[];
  readonly comments: WordComments;
  readonly counting: Counting;
  /**
   * Whether the blocks being written are the document's structure: not in a list, a table, a quote
   * or a page region, whose headings and paragraphs are not counted or numbered.
   */
  readonly structural: boolean;
}

/** The relationship id of a part's link, by its number from 1. */
export const linkId = (index: number): string => `rIdLink${String(index)}`;
