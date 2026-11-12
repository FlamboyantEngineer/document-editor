import { describe, expect, it } from 'vitest';
import type { DocumentFile, StoredNode } from '../model/format/document-format.js';
import { mergeDocuments } from './merge.js';
import { canKeepBoth, resolveMergeConflict } from './merge-conflicts.js';

const paragraph = (id: string, text: string): StoredNode => ({
  type: 'paragraph',
  attrs: { id },
  content: [{ type: 'text', text }],
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
