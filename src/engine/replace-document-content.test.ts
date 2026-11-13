import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import type { DocumentFile, StoredNode } from '../model/format/document-format.js';
import { readDocumentFile } from '../model/format/document-format-convert.js';
import { createDocumentSchema } from '../model/schema/document-schema.js';
import { replaceDocumentContent } from './replace-document-content.js';
import { isSystemChange } from './transaction-kind.js';

const schema = createDocumentSchema();

const paragraph = (id: string, text: string): StoredNode => ({
  type: 'paragraph',
  attrs: { id },
  content: [{ type: 'text', text }],
});

const read = (...content: StoredNode[]) => {
  const file: DocumentFile = { formatVersion: 1, sections: [{ name: null, content }] };
  return readDocumentFile(file, schema).doc;
};

// The paragraph nodes of a document, in order.
const paragraphsOf = (state: EditorState) => {
  const found: { text: string; node: unknown }[] = [];
  state.doc.descendants((node) => {
    if (node.type.name === 'paragraph') found.push({ text: node.textContent, node });
    return !node.isTextblock;
  });
  return found;
};

// A state with the caret at `offset` characters into the paragraph with this text.
function stateWithCaret(doc: ReturnType<typeof read>, text: string, offset: number) {
  let at = -1;
  doc.descendants((node, pos) => {
    if (node.isTextblock && node.textContent === text) at = pos + 1 + offset;
    return at < 0 && !node.isTextblock;
  });
  const state = EditorState.create({ doc });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, at)));
}

describe('replaceDocumentContent', () => {
  const before = read(
    paragraph('a0000001', 'Alpha'),
    paragraph('a0000002', 'Bravo'),
    paragraph('a0000003', 'Charlie'),
  );

  it('DOCE-SESSION-7.2 changes only the blocks that differ and keeps the caret', () => {
    const state = stateWithCaret(before, 'Bravo', 2);
    const after = read(
      paragraph('a0000001', 'Alpha one'),
      paragraph('a0000002', 'Bravo'),
      paragraph('a0000004', 'Delta'),
      paragraph('a0000003', 'Charlie three'),
    );
    const tr = replaceDocumentContent(state, after);
    const next = state.apply(tr);
    expect(next.doc.eq(after)).toBe(true);
    expect(paragraphsOf(next)[1]?.node).toBe(paragraphsOf(state)[1]?.node);
    expect(next.doc.textBetween(next.selection.from - 2, next.selection.from)).toBe('Br');
    expect(isSystemChange(tr)).toBe(true);
    expect(tr.getMeta('addToHistory')).toBe(false);
  });

  it('DOCE-SESSION-7.2 keeps the caret inside a block whose text changed elsewhere', () => {
    const state = stateWithCaret(before, 'Charlie', 3);
    const after = read(
      paragraph('a0000001', 'Alpha'),
      paragraph('a0000002', 'Bravo'),
      paragraph('a0000003', 'Charlie, at the end'),
    );
    const next = state.apply(replaceDocumentContent(state, after));
    expect(next.doc.eq(after)).toBe(true);
    expect(next.doc.textBetween(next.selection.from - 3, next.selection.from)).toBe('Cha');
  });

  it('DOCE-SESSION-7.2 makes no change for the same document', () => {
    const state = EditorState.create({ doc: before });
    expect(
      replaceDocumentContent(
        state,
        read(
          paragraph('a0000001', 'Alpha'),
          paragraph('a0000002', 'Bravo'),
          paragraph('a0000003', 'Charlie'),
        ),
      ).docChanged,
    ).toBe(false);
  });

  it('DOCE-SESSION-7.2 replaces an inline node whose text changed as a whole', () => {
    const equation = (source: string): StoredNode => ({
      type: 'paragraph',
      attrs: { id: 'a0000001' },
      content: [
        { type: 'text', text: 'Area ' },
        { type: 'math', attrs: { id: 'a0000009', source } },
        { type: 'text', text: ' holds' },
      ],
    });
    const equations = (state: EditorState) => {
      const found: string[] = [];
      state.doc.descendants((node) => {
        if (node.type.name === 'math_inline') found.push(node.textContent);
      });
      return found;
    };
    for (const [from, to] of [
      ['x^2+y', 'x^3+y'],
      ['a', 'b'],
      ['xx', 'xxx'],
      ['x^2+y', 'y'],
    ] as const) {
      const state = EditorState.create({ doc: read(equation(from)) });
      const after = read(equation(to));
      const next = state.apply(replaceDocumentContent(state, after));
      expect(equations(next)).toEqual([to]);
      expect(next.doc.eq(after)).toBe(true);
    }
  });

  it('DOCE-SESSION-7.2 removes and reorders blocks', () => {
    const state = stateWithCaret(before, 'Alpha', 1);
    const after = read(paragraph('a0000003', 'Charlie'), paragraph('a0000001', 'Alpha'));
    const next = state.apply(replaceDocumentContent(state, after));
    expect(next.doc.eq(after)).toBe(true);
    expect(paragraphsOf(next).map((each) => each.text)).toEqual(['Charlie', 'Alpha']);
  });
});
