import { describe, expect, it } from 'vitest';
import type { DocumentFile, StoredNode } from '../model/format/document-format.js';
import { mergeDocuments } from './merge.js';
import { resolveMergeConflict } from './merge-conflicts.js';

// A paragraph as a host that gives no element ids stores it, or as an editor identified it.
const paragraph = (text: string, attrs?: StoredNode['attrs']): StoredNode => ({
  type: 'paragraph',
  ...(attrs ? { attrs } : {}),
  content: [{ type: 'text', text }],
});

const list = (id: string | null, items: StoredNode[]): StoredNode => ({
  type: 'bulletList',
  ...(id ? { attrs: { id } } : {}),
  content: items.map((item, index) => ({
    type: 'listItem',
    ...(id ? { attrs: { id: `${id.slice(0, 7)}${String(index)}` } } : {}),
    content: [item],
  })),
});

const file = (...content: StoredNode[]): DocumentFile => ({
  formatVersion: 1,
  sections: [{ name: null, content }],
});

const blocks = (content: DocumentFile) => content.sections.flatMap((section) => section.content);
const text = (node: StoredNode): string => node.text ?? (node.content ?? []).map(text).join('');
const texts = (content: DocumentFile) => blocks(content).map(text);
const ids = (content: DocumentFile) => blocks(content).map((node) => node.attrs?.id);

// Ids in order, so a test can name the ones a merge makes.
function counter() {
  let made = 0;
  return () => {
    made += 1;
    return `f000000${String(made)}`;
  };
}

describe('mergeDocuments on blocks without element ids', () => {
  it('DOCE-SESSION-4.1 takes each side’s changes to blocks that have no id', () => {
    const base = file(paragraph('One'), paragraph('Two'), paragraph('Three'));
    const mine = file(paragraph('One, mine'), paragraph('Two'), paragraph('Three'));
    const theirs = file(paragraph('One'), paragraph('Two'), paragraph('Three, theirs'));
    const merge = mergeDocuments({ base, mine, theirs, newId: counter() });
    expect(merge.conflicts).toEqual([]);
    expect(texts(merge.content)).toEqual(['One, mine', 'Two', 'Three, theirs']);
    expect(new Set(ids(merge.content)).size).toBe(3);
  });

  it('DOCE-SESSION-4.1 pairs the blocks each editor gave its own ids, keeping the stored ids', () => {
    const base = file(paragraph('One'), paragraph('Two'));
    const mine = file(
      paragraph('One', { id: 'b0000001' }),
      paragraph('Two', { id: 'b0000002' }),
      paragraph('Mine', { id: 'b0000003' }),
    );
    const theirs = file(
      paragraph('One', { id: 'c0000001' }),
      paragraph('Theirs', { id: 'c0000002' }),
      paragraph('Two', { id: 'c0000003' }),
    );
    const merge = mergeDocuments({ base, mine, theirs });
    expect(merge.conflicts).toEqual([]);
    expect(texts(merge.content)).toEqual(['One', 'Theirs', 'Two', 'Mine']);
    expect(ids(merge.content)).toEqual(['c0000001', 'c0000002', 'c0000003', 'b0000003']);
  });

  it('DOCE-SESSION-4.1 reads the writer an editor gave a block with its id as no change', () => {
    const base = file(paragraph('One'), paragraph('Two'));
    const mine = file(
      paragraph('One', { id: 'b0000001', author: 'grace' }),
      paragraph('Two, mine', { id: 'b0000002', author: 'grace' }),
    );
    const theirs = file(
      paragraph('One', { id: 'c0000001', author: 'ada' }),
      paragraph('Two', { id: 'c0000002', author: 'ada' }),
    );
    const merge = mergeDocuments({ base, mine, theirs });
    expect(merge.conflicts).toEqual([]);
    expect(merge.content).toEqual(
      file(
        paragraph('One', { id: 'c0000001', author: 'ada' }),
        paragraph('Two, mine', { id: 'c0000002', author: 'ada' }),
      ),
    );
  });

  it('DOCE-SESSION-4.1 pairs the items of a list that has no ids', () => {
    const base = file(list(null, [paragraph('First'), paragraph('Second')]));
    const mine = file(
      list('b0000010', [
        paragraph('First', { id: 'b0000001' }),
        paragraph('Second, mine', { id: 'b0000002' }),
      ]),
    );
    const theirs = file(
      list('c0000010', [
        paragraph('First, theirs', { id: 'c0000001' }),
        paragraph('Second', { id: 'c0000002' }),
      ]),
    );
    const merge = mergeDocuments({ base, mine, theirs });
    expect(merge.conflicts).toEqual([]);
    expect(merge.content).toEqual(
      file(
        list('c0000010', [
          paragraph('First, theirs', { id: 'c0000001' }),
          paragraph('Second, mine', { id: 'c0000002' }),
        ]),
      ),
    );
  });

  it('DOCE-SESSION-4.2 reports a block without an id both changed, under an id the merge gives it', () => {
    const base = file(paragraph('One'), paragraph('Two'));
    const mine = file(paragraph('One, mine'), paragraph('Two'));
    const theirs = file(paragraph('One, theirs'), paragraph('Two'));
    const merge = mergeDocuments({ base, mine, theirs, newId: counter() });
    expect(merge.conflicts).toMatchObject([{ id: 'f0000001' }]);
    expect(texts(merge.content)).toEqual(['One, mine', 'Two']);
    const [conflict] = merge.conflicts;
    if (!conflict) throw new Error('The merge reported no conflict.');
    const settled = resolveMergeConflict(merge.content, conflict, {
      choice: 'theirs',
      newId: counter(),
    });
    expect(texts(settled)).toEqual(['One, theirs', 'Two']);
  });

  it('DOCE-SESSION-4.1 leaves documents whose blocks all have ids as they are', () => {
    const base = file(paragraph('One', { id: 'a0000001' }));
    const mine = file(paragraph('One, mine', { id: 'a0000001' }));
    const merge = mergeDocuments({ base, mine, theirs: base });
    expect(merge.content).toEqual(mine);
  });
});
