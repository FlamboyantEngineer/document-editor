import { Node } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import { describe, expect, it, vi } from 'vitest';
import {
  caretAt,
  footnoteParts,
  footnoteState,
  note,
  paragraph,
  text,
  textPos,
} from '../../test/footnote-fixtures.js';
import { listFootnotes } from './footnotes.js';

const twoNotes = () =>
  footnoteState(
    [paragraph(text('One'), note('n1', 'First'), text(' two'), note('n2', 'Second'), text(' end'))],
    { newId: () => 'copy' },
  );

const markerOf = (state: ReturnType<typeof twoNotes>, id: string) =>
  listFootnotes(state.doc).get(id)?.marker ?? -1;

describe('footnote reconcile', () => {
  it('DOCE-FOOTNOTES-1.3 deletes an entry whose marker is deleted, and renumbers', () => {
    let state = twoNotes();
    const marker = markerOf(state, 'n1');
    state = state.apply(state.tr.delete(marker, marker + 1));
    expect(footnoteParts(state)).toEqual(['marker:n2', 'entry:n2:Second']);
    expect(footnoteParts(state, 'number')).toEqual(['marker:1', 'entry:1:Second']);
  });

  it('DOCE-FOOTNOTES-1.3 gives a cut marker its text back when it is pasted, in marker order', () => {
    let state = twoNotes();
    const marker = markerOf(state, 'n2');
    const cut = state.doc.slice(marker, marker + 1);
    state = state.apply(state.tr.delete(marker, marker + 1));
    expect(footnoteParts(state)).toEqual(['marker:n1', 'entry:n1:First']);
    state = state.apply(state.tr.replace(textPos(state, 'One'), textPos(state, 'One'), cut));
    expect(footnoteParts(state)).toEqual([
      'marker:n2',
      'marker:n1',
      'entry:n2:Second',
      'entry:n1:First',
    ]);
    expect(footnoteParts(state, 'number')).toEqual([
      'marker:1',
      'marker:2',
      'entry:1:Second',
      'entry:2:First',
    ]);
  });

  it('DOCE-FOOTNOTES-1.3 makes a copied marker a footnote of its own, with a copy of the text', () => {
    let state = twoNotes();
    const marker = markerOf(state, 'n1');
    const copy = state.doc.slice(marker, marker + 1);
    // Pasted before the original, which keeps its id.
    state = state.apply(state.tr.replace(textPos(state, 'One'), textPos(state, 'One'), copy));
    expect(footnoteParts(state)).toEqual([
      'marker:copy',
      'marker:n1',
      'marker:n2',
      'entry:copy:First',
      'entry:n1:First',
      'entry:n2:Second',
    ]);
  });

  it('DOCE-FOOTNOTES-1.3 gives a marker with no entry an empty one, and removes a repeated entry', () => {
    let state = twoNotes();
    const entry = listFootnotes(state.doc).get('n1')?.entry ?? -1;
    const node = state.doc.nodeAt(entry);
    if (!node) throw new Error('No entry');
    // The writer's change that loses n1's entry and repeats n2's.
    const tr = state.tr.delete(entry, entry + node.nodeSize);
    const second = listFootnotes(tr.doc).get('n2')?.entry ?? -1;
    const repeated = tr.doc.nodeAt(second);
    if (!repeated) throw new Error('No entry');
    state = state.apply(tr.insert(second, repeated));
    expect(footnoteParts(state)).toEqual([
      'marker:n1',
      'marker:n2',
      'entry:n1:',
      'entry:n2:Second',
    ]);
  });

  it('DOCE-FOOTNOTES-1.3 leaves remote changes to the writer who made them', () => {
    let state = twoNotes();
    const marker = markerOf(state, 'n1');
    state = state.apply(state.tr.delete(marker, marker + 1).setMeta('remote', true));
    expect(footnoteParts(state)).toContain('entry:n1:First');
  });

  it('DOCE-FOOTNOTES-1.3 does not walk the document for a change to text alone', () => {
    let state = caretAt(twoNotes(), 'end', 3);
    const walk = vi.spyOn(Node.prototype, 'descendants');
    state = state.apply(state.tr.insertText('!'));
    state = state.apply(state.tr.delete(state.selection.from - 1, state.selection.from));
    expect(walk).not.toHaveBeenCalled();
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));
    const marker = markerOf(state, 'n2');
    walk.mockClear();
    state = state.apply(state.tr.delete(marker, marker + 1));
    expect(walk).toHaveBeenCalled();
    expect(footnoteParts(state)).toEqual(['marker:n1', 'entry:n1:First']);
  });
});
