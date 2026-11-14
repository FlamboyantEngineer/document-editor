import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { isActive } from './active.js';

const read = (...content: StoredNode[]) =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema).doc;

const doc = read(
  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Scope' }] },
  {
    type: 'paragraph',
    content: [
      { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' and ' },
      { type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: 'https://a.test' } }] },
    ],
  },
  { type: 'rule' },
);

// Where a text starts in the document.
function startOf(text: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    const at = node.isText ? (node.text ?? '').indexOf(text) : -1;
    if (found < 0 && at >= 0) found = pos + at;
    return found < 0;
  });
  return found;
}

const at = (from: number, to = from) =>
  EditorState.create({ doc, selection: TextSelection.create(doc, from, to) });

describe('isActive', () => {
  it('DOCE-EDITING-8.1 reads a mark at the caret, the marks it types with, and over a range', () => {
    const bold = startOf('bold');
    expect(isActive(at(bold + 2), 'strong')).toBe(true);
    expect(isActive(at(bold, bold + 4), 'strong')).toBe(true);
    expect(isActive(at(bold, bold + 6), 'strong')).toBe(false);
    const stored = at(startOf('and') + 1);
    const strong = documentSchema.marks.strong;
    if (!strong) throw new Error('no strong');
    const typing = stored.apply(stored.tr.addStoredMark(strong.create()));
    expect(isActive(typing, 'strong')).toBe(true);
  });

  it('DOCE-EDITING-8.1 reads a mark or a node with the attributes asked for', () => {
    const link = startOf('link') + 2;
    expect(isActive(at(link), 'link', { href: 'https://a.test' })).toBe(true);
    expect(isActive(at(link), 'link', { href: 'https://b.test' })).toBe(false);
    const heading = startOf('Scope') + 1;
    expect(isActive(at(heading), 'heading', { level: 2 })).toBe(true);
    expect(isActive(at(heading), 'heading', { level: 1 })).toBe(false);
    expect(isActive(at(heading, startOf('bold') + 1), 'heading')).toBe(false);
  });

  it('DOCE-EDITING-8.1 reads a selected node, and nothing for a name the schema lacks', () => {
    let rule = -1;
    doc.descendants((node, pos) => {
      if (node.type.name === 'horizontal_rule') rule = pos;
      return rule < 0;
    });
    const selected = EditorState.create({ doc, selection: NodeSelection.create(doc, rule) });
    expect(isActive(selected, 'horizontal_rule')).toBe(true);
    expect(isActive(selected, 'no_such_type')).toBe(false);
  });
});
