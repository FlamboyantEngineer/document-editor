// The forced-lines lab's documents: the cases the spike must cover (styled words, a line ending in
// a space, an empty paragraph, hard breaks including a final one, bidirectional text, long words),
// and the scale lab's plain documents of 40 and 300 pages for the typing budgets.

import type { DocumentFile, StoredNode } from '../../../../src/model/index.js';
import { singleSectionDocument } from '../../stress/scale-documents.js';

const text = (value: string, ...marks: string[]): StoredNode => ({
  type: 'text',
  text: value,
  ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
});
const paragraph = (...content: StoredNode[]): StoredNode => ({ type: 'paragraph', content });
const heading = (level: number, value: string): StoredNode => ({
  type: 'heading',
  attrs: { level },
  content: [text(value)],
});
const lineBreak: StoredNode = { type: 'lineBreak' };

const PROSE =
  'Every line of this paragraph starts where the layout engine said it would, because the ' +
  'editor draws a break before each computed line start and never wraps the text itself. ';

/** The cases document. */
export function casesDocument(): DocumentFile {
  return {
    formatVersion: 1,
    sections: [
      {
        name: null,
        content: [
          heading(1, 'Forced lines'),
          paragraph(text(PROSE.repeat(3))),
          paragraph(
            text('Styled words keep their own fonts: '),
            text('bold words in a long run of bold text', 'bold'),
            text(', then '),
            text('italic words that lean', 'italic'),
            text(', then '),
            text('inline code', 'code'),
            text(', and acronyms such as FAA, NASA and AVA that kern with the space after them, '),
            {
              type: 'text',
              text: 'words under a comment',
              marks: [{ type: 'comment', attrs: { thread: 'lab-thread', state: 'open' } }],
            },
            text(' and a '),
            {
              type: 'text',
              text: 'linked phrase',
              marks: [{ type: 'link', attrs: { href: 'https://example.com/' } }],
            },
            text('. '),
            text(PROSE),
          ),
          paragraph(text(`${PROSE}This line ends in a space `)),
          paragraph(),
          paragraph(
            text('A hard break ends this line'),
            lineBreak,
            text(`and the next run is laid out on its own. ${PROSE}`),
            lineBreak,
          ),
          paragraph(
            text(
              'Mixed directions: the phrase שלום עולם sits inside English text, and so does ' +
                'مرحبا بالعالم, before the sentence carries on to wrap across the column. ',
            ),
            text(PROSE),
          ),
          paragraph(
            text(
              `${'Averyveryverylongwordwithoutanyspaces'.repeat(3)} ` +
                'is broken inside the word.',
            ),
          ),
          heading(2, 'A second heading'),
          ...Array.from({ length: 40 }, (_, index) =>
            paragraph(text(`${String(index + 1)}. ${PROSE.repeat(1 + (index % 3))}`)),
          ),
        ],
      },
    ],
  };
}

export { singleSectionDocument };
