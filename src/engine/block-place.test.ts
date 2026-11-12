import type { Node } from 'prosemirror-model';
import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { insertPageBreak } from './editing-commands.js';
import { insertTable } from './tables.js';

const paragraph = (value: string) =>
  documentSchema.node('paragraph', null, documentSchema.text(value));

// One page with text in its header, body, footnote area and footer.
const page = documentSchema.node('doc', null, [
  documentSchema.node('page_section', null, [
    documentSchema.node('page', null, [
      documentSchema.node('page_header', null, [paragraph('Heading text')]),
      documentSchema.node('page_content', null, [paragraph('Body text')]),
      documentSchema.node('page_footnotes', null, [
        documentSchema.node(
          'footnote_entry',
          { footnoteId: 'note-1' },
          documentSchema.text('Note'),
        ),
      ]),
      documentSchema.node('page_footer', null, [paragraph('Footer text')]),
    ]),
  ]),
]);

function stateAt(doc: Node, value: string) {
  let at = -1;
  doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text?.includes(value)) at = pos + 1;
    return at < 0;
  });
  return EditorState.create({ doc, selection: TextSelection.create(doc, at) });
}

const blockCommands: [string, Command][] = [
  ['a table', insertTable({ rows: 2, columns: 2 })],
  ['a page break', insertPageBreak],
];

describe('block placement', () => {
  it.each(blockCommands)('DOCE-EDITING-2.9 adds %s in the body', (_, command) => {
    let next: EditorState | null = null;
    const state = stateAt(page, 'Body');
    expect(command(state, (tr) => (next = state.apply(tr)))).toBe(true);
    expect(next).not.toBeNull();
  });

  it.each(['Heading', 'Note', 'Footer'])(
    'DOCE-EDITING-2.9 adds no block with the caret in the page region holding %s',
    (value) => {
      const state = stateAt(page, value);
      for (const [, command] of blockCommands) expect(command(state)).toBe(false);
    },
  );
});
