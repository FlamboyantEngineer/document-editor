import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import type { DocumentFile, StoredNode } from '../model/format/document-format.js';
import { readDocumentFile } from '../model/format/document-format-convert.js';
import { mergeDocuments } from './merge.js';
import { canKeepBoth, resolveMergeConflict } from './merge-conflicts.js';

const paragraph = (id: string, text: string): StoredNode => ({
  type: 'paragraph',
  attrs: { id },
  content: [{ type: 'text', text }],
});

const quote = (id: string, ...content: StoredNode[]): StoredNode => ({
  type: 'blockquote',
  attrs: { id },
  content,
});

const list = (id: string, items: StoredNode[]): StoredNode => ({
  type: 'bulletList',
  attrs: { id },
  content: items.map((item, index) => ({
    type: 'listItem',
    attrs: { id: `${id.slice(0, 7)}${String(index)}` },
    content: [item],
  })),
});

const file = (...content: StoredNode[]): DocumentFile => ({
  formatVersion: 1,
  sections: [{ id: 's0000001', content }],
});

const texts = (content: DocumentFile) =>
  content.sections.flatMap((section) => section.content.map((node) => JSON.stringify(node)));

const ONE = paragraph('a0000001', 'One');
const TWO = paragraph('a0000002', 'Two');
const THREE = paragraph('a0000003', 'Three');
const BASE = file(ONE, TWO, THREE);

describe('mergeDocuments', () => {
  it('DOCE-SESSION-4.1 takes each side’s changes to different blocks without a conflict', () => {
    const mine = file(paragraph('a0000001', 'One, mine'), TWO, THREE);
    const theirs = file(ONE, TWO, paragraph('a0000003', 'Three, theirs'));
    const merge = mergeDocuments({ base: BASE, mine, theirs });
    expect(merge.conflicts).toEqual([]);
    expect(merge.content).toEqual(
      file(paragraph('a0000001', 'One, mine'), TWO, paragraph('a0000003', 'Three, theirs')),
    );
  });

  it('DOCE-SESSION-4.1 keeps blocks either side inserted, each after the block before it', () => {
    const mine = file(ONE, paragraph('b0000001', 'Mine'), TWO, THREE);
    const theirs = file(ONE, TWO, paragraph('c0000001', 'Theirs'), THREE);
    const merge = mergeDocuments({ base: BASE, mine, theirs });
    expect(merge.conflicts).toEqual([]);
    expect(texts(merge.content)).toEqual(
      texts(file(ONE, paragraph('b0000001', 'Mine'), TWO, paragraph('c0000001', 'Theirs'), THREE)),
    );
  });

  it('DOCE-SESSION-4.1 removes a block one side deleted and the other left alone', () => {
    const mine = file(ONE, paragraph('a0000002', 'Two, mine'), THREE);
    const theirs = file(TWO, THREE);
    const merge = mergeDocuments({ base: BASE, mine, theirs });
    expect(merge.conflicts).toEqual([]);
    expect(merge.content).toEqual(file(paragraph('a0000002', 'Two, mine'), THREE));
  });

  it('DOCE-SESSION-4.1 follows the other writer’s moves when the reader moved nothing', () => {
    const mine = file(paragraph('a0000001', 'One, mine'), TWO, THREE);
    const theirs = file(THREE, ONE, TWO);
    const merge = mergeDocuments({ base: BASE, mine, theirs });
    expect(merge.content).toEqual(file(THREE, paragraph('a0000001', 'One, mine'), TWO));
  });

  // Two sections, so a block can move from one to the other.
  const sections = (first: StoredNode[], second: StoredNode[]): DocumentFile => ({
    formatVersion: 1,
    sections: [
      { id: 's0000001', content: first },
      { id: 's0000002', content: second },
    ],
  });

  it('DOCE-SESSION-4.1 keeps a block the reader moved to another section once, with the other writer’s change', () => {
    const base = sections([ONE, TWO], [THREE]);
    const mine = sections([TWO], [THREE, ONE]);
    const theirs = sections([paragraph('a0000001', 'One, theirs'), TWO], [THREE]);
    const merge = mergeDocuments({ base, mine, theirs });
    expect(merge.conflicts).toEqual([]);
    expect(merge.content).toEqual(sections([TWO], [THREE, paragraph('a0000001', 'One, theirs')]));
  });

  it('DOCE-SESSION-4.1 puts the reader’s change where the other writer moved its block', () => {
    const base = sections([ONE, TWO], [THREE]);
    const mine = sections([paragraph('a0000001', 'One, mine'), TWO], [THREE]);
    const theirs = sections([TWO], [ONE, THREE]);
    const merge = mergeDocuments({ base, mine, theirs });
    expect(merge.conflicts).toEqual([]);
    expect(merge.content).toEqual(sections([TWO], [paragraph('a0000001', 'One, mine'), THREE]));
  });

  it('DOCE-SESSION-4.2 reports a block one side moved and both changed once, where it was moved', () => {
    const base = sections([ONE, TWO], [THREE]);
    const mine = sections([TWO], [THREE, paragraph('a0000001', 'One, mine')]);
    const theirs = sections([paragraph('a0000001', 'One, theirs'), TWO], [THREE]);
    const merge = mergeDocuments({ base, mine, theirs });
    expect(merge.conflicts).toEqual([
      {
        id: 'a0000001',
        mine: paragraph('a0000001', 'One, mine'),
        theirs: paragraph('a0000001', 'One, theirs'),
      },
    ]);
    expect(merge.content).toEqual(sections([TWO], [THREE, paragraph('a0000001', 'One, mine')]));
  });

  it('DOCE-SESSION-4.1 keeps a block the reader moved that the other writer deleted', () => {
    const base = sections([ONE, TWO], [THREE]);
    const mine = sections([TWO], [THREE, ONE]);
    const theirs = sections([TWO], [THREE]);
    const merge = mergeDocuments({ base, mine, theirs });
    expect(merge.conflicts).toEqual([]);
    expect(merge.content).toEqual(mine);
  });

  it('DOCE-SESSION-4.1 puts the changed block inside the new section one writer moved it into', () => {
    const base = file(ONE, TWO);
    const mine = sections([TWO], [ONE]);
    const changed = paragraph('a0000001', 'One, theirs');
    const theirs = file(changed, TWO);
    const merge = mergeDocuments({ base, mine, theirs });
    expect(merge).toEqual({ content: sections([TWO], [changed]), conflicts: [] });
  });

  it('DOCE-SESSION-4.1 puts a block moved into two different new sections in the reader’s once', () => {
    const base = file(ONE, TWO);
    const mine = sections([TWO], [ONE]);
    const theirs = {
      ...base,
      sections: [
        { id: 's0000001', content: [TWO] },
        { id: 's0000003', content: [ONE, THREE] },
      ],
    };
    const merge = mergeDocuments({ base, mine, theirs });
    expect(merge).toEqual({
      content: {
        ...mine,
        sections: [
          { id: 's0000001', content: [TWO] },
          { id: 's0000003', content: [THREE] },
          { id: 's0000002', content: [ONE] },
        ],
      },
      conflicts: [],
    });
  });

  it('DOCE-SESSION-4.1 brings the other writer’s edit to a new nested destination', () => {
    const base = file(ONE, TWO);
    const moving = sections([TWO], [list('l0000001', [ONE])]);
    const changed = paragraph('a0000001', 'One, edited');
    const editing = file(changed, TWO);
    for (const [mine, theirs] of [
      [moving, editing],
      [editing, moving],
    ] as const) {
      const merge = mergeDocuments({ base, mine, theirs });
      expect(merge).toEqual({
        content: sections([TWO], [list('l0000001', [changed])]),
        conflicts: [],
      });
    }
  });

  it('DOCE-SESSION-4.1 keeps the document valid when a nested destination loses a competing move', () => {
    const base = file(ONE, TWO);
    const mine = file(TWO, quote('q0000001', ONE));
    const theirs = file(TWO, quote('q0000002', ONE));
    const merged = mergeDocuments({ base, mine, theirs });
    expect(merged).toEqual({ content: mine, conflicts: [] });
    expect(readDocumentFile(merged.content, documentSchema).problems).toEqual([]);
  });

  it('DOCE-SESSION-4.1 leaves an emptied source behind when the other writer only changed the moved block', () => {
    const base = file(quote('q0000001', ONE), TWO);
    const mine = sections([TWO], [ONE]);
    const changed = paragraph('a0000001', 'One, theirs');
    const theirs = file(quote('q0000001', changed), TWO);
    const merged = mergeDocuments({ base, mine, theirs });
    expect(merged).toEqual({ content: sections([TWO], [changed]), conflicts: [] });
    expect(readDocumentFile(merged.content, documentSchema).problems).toEqual([]);
  });

  it('DOCE-SESSION-4.2 keeps a changed source for conflict resolution without duplicating a moved block', () => {
    const base = file(quote('q0000001', ONE, THREE), TWO);
    const mine = sections([TWO], [ONE]);
    const changed = paragraph('a0000001', 'One, theirs');
    const other = paragraph('a0000003', 'Three, theirs');
    const theirs = file(quote('q0000001', changed, other), TWO);
    const merged = mergeDocuments({ base, mine, theirs });
    const kept = quote('q0000001', other);
    expect(merged.content).toEqual(sections([kept, TWO], [changed]));
    const [conflict] = merged.conflicts;
    expect(conflict).toEqual({ id: 'q0000001', mine: null, theirs: kept });
    if (!conflict) throw new Error('The source has no conflict.');
    const resolved = resolveMergeConflict(merged.content, conflict, {
      choice: 'theirs',
      newId: () => 'r0000001',
    });
    expect(resolved).toEqual(merged.content);
    expect(readDocumentFile(resolved, documentSchema).problems).toEqual([]);
  });

  it('DOCE-SESSION-4.1 retains insertion anchors when the lead moves and the other side deletes', () => {
    const head = paragraph('b0000001', 'Before');
    const next = paragraph('b0000002', 'Next');
    const tail = paragraph('b0000003', 'After');
    const mine = file(THREE, ONE, TWO);
    const theirs = file(head, ONE, next, THREE, tail);
    expect(mergeDocuments({ base: BASE, mine, theirs }).content).toEqual(
      file(head, THREE, tail, ONE, next),
    );
  });

  it('DOCE-SESSION-4.1 orders disjoint edits without scanning the output for each kept block', () => {
    for (const size of [500, 2000]) {
      const blocks = Array.from({ length: size }, (_, index) =>
        paragraph(`merge-${String(index)}`, 'Text'),
      );
      const base = file(...blocks);
      const mine = file(paragraph('merge-0', 'Mine'), ...blocks.slice(1));
      const theirs = file(...blocks.slice(0, -1), paragraph(`merge-${String(size - 1)}`, 'Theirs'));
      let scans = 0;
      const indexOf = Array.prototype.indexOf;
      const spy = vi.spyOn(Array.prototype, 'indexOf').mockImplementation(function (
        this: unknown[],
        key,
        from,
      ) {
        if (typeof key === 'string' && key.startsWith('merge-')) scans += this.length;
        return indexOf.call(this, key, from);
      });
      const merged = (() => {
        try {
          return mergeDocuments({ base, mine, theirs });
        } finally {
          spy.mockRestore();
        }
      })();
      expect(scans).toBeLessThanOrEqual(size);
      expect(merged).toEqual({
        content: file(
          paragraph('merge-0', 'Mine'),
          ...blocks.slice(1, -1),
          paragraph(`merge-${String(size - 1)}`, 'Theirs'),
        ),
        conflicts: [],
      });
    }
  });

  it('DOCE-SESSION-4.1 merges the items of a list both sides changed', () => {
    const base = file(list('l0000001', [ONE, TWO]));
    const mine = file(list('l0000001', [paragraph('a0000001', 'One, mine'), TWO]));
    const theirs = file(list('l0000001', [ONE, paragraph('a0000002', 'Two, theirs')]));
    const merge = mergeDocuments({ base, mine, theirs });
    expect(merge.conflicts).toEqual([]);
    expect(merge.content).toEqual(
      file(
        list('l0000001', [
          paragraph('a0000001', 'One, mine'),
          paragraph('a0000002', 'Two, theirs'),
        ]),
      ),
    );
  });

  it('DOCE-SESSION-4.1 takes the other writer’s template pin when the reader kept theirs', () => {
    const theirs = { ...BASE, template: { id: 'report', revision: 'r2' } };
    const merge = mergeDocuments({ base: BASE, mine: BASE, theirs });
    expect(merge.content.template).toEqual({ id: 'report', revision: 'r2' });
  });

  it('DOCE-SESSION-4.2 reports a block both sides changed, showing the reader’s version', () => {
    const mine = file(ONE, paragraph('a0000002', 'Two, mine'), THREE);
    const theirs = file(ONE, paragraph('a0000002', 'Two, theirs'), THREE);
    const merge = mergeDocuments({ base: BASE, mine, theirs });
    expect(merge.conflicts).toEqual([
      {
        id: 'a0000002',
        mine: paragraph('a0000002', 'Two, mine'),
        theirs: paragraph('a0000002', 'Two, theirs'),
      },
    ]);
    expect(merge.content).toEqual(mine);
  });

  it('DOCE-SESSION-4.2 agrees without a conflict when both sides made the same change', () => {
    const both = file(ONE, paragraph('a0000002', 'Two, both'), THREE);
    expect(mergeDocuments({ base: BASE, mine: both, theirs: both }).conflicts).toEqual([]);
  });

  it('DOCE-SESSION-4.2 reports a block one side deleted and the other changed, keeping it', () => {
    const mine = file(ONE, THREE);
    const theirs = file(ONE, paragraph('a0000002', 'Two, theirs'), THREE);
    const merge = mergeDocuments({ base: BASE, mine, theirs });
    expect(merge.conflicts).toEqual([
      { id: 'a0000002', mine: null, theirs: paragraph('a0000002', 'Two, theirs') },
    ]);
    expect(merge.content).toEqual(theirs);
  });
});

describe('resolveMergeConflict', () => {
  const conflict = {
    id: 'a0000002',
    mine: paragraph('a0000002', 'Two, mine'),
    theirs: paragraph('a0000002', 'Two, theirs'),
  };
  const merged = file(ONE, paragraph('a0000002', 'Two, mine, then more'), THREE);
  const newId = () => 'f0000001';

  it('DOCE-SESSION-4.2 keeps the reader’s block as it is now', () => {
    expect(resolveMergeConflict(merged, conflict, { choice: 'mine', newId })).toEqual(merged);
  });

  it('DOCE-SESSION-4.2 puts the other writer’s block in its place', () => {
    expect(resolveMergeConflict(merged, conflict, { choice: 'theirs', newId })).toEqual(
      file(ONE, paragraph('a0000002', 'Two, theirs'), THREE),
    );
  });

  it('DOCE-SESSION-4.2 keeps both texts, the other writer’s after the reader’s with a new id', () => {
    expect(canKeepBoth(conflict)).toBe(true);
    expect(resolveMergeConflict(merged, conflict, { choice: 'both', newId })).toEqual(
      file(
        ONE,
        paragraph('a0000002', 'Two, mine, then more'),
        paragraph('f0000001', 'Two, theirs'),
        THREE,
      ),
    );
  });

  it('DOCE-SESSION-4.2 removes the block when the chosen side deleted it', () => {
    const deleted = { id: 'a0000002', mine: null, theirs: paragraph('a0000002', 'Two, theirs') };
    expect(canKeepBoth(deleted)).toBe(false);
    const shown = file(ONE, paragraph('a0000002', 'Two, theirs'), THREE);
    expect(resolveMergeConflict(shown, deleted, { choice: 'mine', newId })).toEqual(
      file(ONE, THREE),
    );
  });

  it('DOCE-SESSION-4.2 finds a block inside a list', () => {
    const inList = file(list('l0000001', [paragraph('a0000002', 'Two, mine')]));
    const resolved = resolveMergeConflict(inList, conflict, { choice: 'theirs', newId });
    expect(resolved).toEqual(file(list('l0000001', [paragraph('a0000002', 'Two, theirs')])));
  });
});
