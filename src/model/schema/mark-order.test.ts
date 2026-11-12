import type { Mark, Node } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import {
  addMarkInOrder,
  compareMarks,
  orderDocumentMarks,
  orderMarks,
  overlapsItself,
} from './mark-order.js';

const { marks, nodes } = documentSchema;
const comment = (id: string) => marks.comment_highlight?.create({ commentId: id }) as Mark;
const insertion = (id: string) =>
  marks.insertion?.create({ dataId: id, dataAuthor: 'ada' }) as Mark;
const strong = marks.strong?.create() as Mark;

// A paragraph whose text "Alpha blue" carries `held` on its last word, in the given order. A
// transform on it counts positions in its content: "blue" is 6 to 10.
function paragraphWith(held: readonly Mark[]): Node {
  return nodes.paragraph?.create(null, [
    documentSchema.text('Alpha '),
    documentSchema.text('blue', held),
  ]) as Node;
}

const ids = (node: Node | null | undefined) =>
  (node?.marks ?? []).map((mark) => mark.attrs.dataId ?? mark.attrs.commentId);

function addAll(doc: Node, added: readonly Mark[]): Node {
  const tr = new Transform(doc);
  for (const mark of added) addMarkInOrder(tr, { from: 0, to: 10 }, mark);
  return tr.doc;
}

describe('mark order', () => {
  it('DOCE-SCHEMA-5.1 tells the mark types that overlap themselves', () => {
    expect(marks.comment_highlight && overlapsItself(marks.comment_highlight)).toBe(true);
    expect(marks.insertion && overlapsItself(marks.insertion)).toBe(true);
    expect(marks.deletion && overlapsItself(marks.deletion)).toBe(true);
    expect(marks.strong && overlapsItself(marks.strong)).toBe(false);
  });

  it('DOCE-SCHEMA-5.1 orders marks of one type by id, then by their other attributes', () => {
    expect(compareMarks(comment('a'), comment('b'))).toBeLessThan(0);
    expect(compareMarks(insertion('b'), insertion('a'))).toBeGreaterThan(0);
    expect(compareMarks(comment('a'), comment('a'))).toBe(0);
    const resolved = marks.comment_highlight?.create({ commentId: 'a', commentState: 'resolved' });
    expect(resolved && compareMarks(comment('a'), resolved)).not.toBe(0);
  });

  it('DOCE-SCHEMA-5.1 sorts a mark set by type, then overlapping marks by id', () => {
    const set = [strong, comment('c2'), comment('c1')];
    expect(orderMarks(set).map((mark) => mark.attrs.commentId ?? mark.type.name)).toEqual([
      'strong',
      'c1',
      'c2',
    ]);
    const ordered = [strong, comment('c1'), comment('c2')];
    expect(orderMarks(ordered)).toBe(ordered);
  });

  it('DOCE-SCHEMA-5.1 gives equal documents whichever order marks are added in', () => {
    const doc = paragraphWith([]);
    const forward = addAll(doc, [comment('c1'), comment('c2'), comment('c3')]);
    const backward = addAll(doc, [comment('c3'), comment('c1'), comment('c2')]);
    expect(forward.eq(backward)).toBe(true);
    expect(ids(forward.firstChild)).toEqual(['c1', 'c2', 'c3']);
  });

  it('DOCE-SCHEMA-5.1 orders the marks a range already held where only part of it gets the new one', () => {
    const doc = addAll(paragraphWith([]), [comment('c2')]);
    const tr = new Transform(doc);
    addMarkInOrder(tr, { from: 6, to: 10 }, comment('c1'));
    expect(ids(tr.doc.nodeAt(0))).toEqual(['c2']);
    expect(ids(tr.doc.nodeAt(6))).toEqual(['c1', 'c2']);
  });

  it('DOCE-SCHEMA-5.1 adds a mark that excludes itself as ProseMirror does', () => {
    const doc = paragraphWith([]);
    const tr = new Transform(doc);
    addMarkInOrder(tr, { from: 0, to: 10 }, strong);
    expect(tr.doc.eq(new Transform(doc).addMark(0, 10, strong).doc)).toBe(true);
  });

  it('DOCE-SCHEMA-5.1 puts a document in canonical order and joins the runs that then match', () => {
    const doc = nodes.paragraph?.create(null, [
      documentSchema.text('Alpha ', [comment('c2'), comment('c1')]),
      documentSchema.text('blue', [comment('c1'), comment('c2')]),
    ]) as Node;
    const ordered = orderDocumentMarks(doc);
    expect(ordered.childCount).toBe(1);
    expect(ids(ordered.firstChild)).toEqual(['c1', 'c2']);
    expect(orderDocumentMarks(ordered)).toBe(ordered);
  });

  it('DOCE-SUGGESTIONS-1.6 orders overlapping suggested insertions by suggestion id', () => {
    const reversed = paragraphWith([insertion('s2'), insertion('s1')]);
    expect(ids(reversed.child(1))).toEqual(['s2', 's1']);
    const ordered = orderDocumentMarks(reversed);
    expect(ids(ordered.child(1))).toEqual(['s1', 's2']);
    const doc = paragraphWith([]);
    expect(
      addAll(doc, [insertion('s2'), insertion('s1')]).eq(
        addAll(doc, [insertion('s1'), insertion('s2')]),
      ),
    ).toBe(true);
  });
});
