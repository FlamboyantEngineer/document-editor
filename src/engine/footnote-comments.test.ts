import { TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import {
  caretAt,
  footnoteState,
  note,
  paragraph,
  runCommand,
  text,
  textPos,
} from '../../test/footnote-fixtures.js';
import { describeCommentTarget, resolveCommentTarget } from './comment-targets.js';
import { addCommentAnchor, linkSuggestionThread, listCommentAnchors } from './comments.js';
import { listSuggestions } from './suggestion-decisions.js';
import { suggestTransaction } from './suggestions.js';

const withNote = () =>
  footnoteState([paragraph(text('Body text.'), note('n1', 'Old wording here'))]);

// The state with a piece of text selected.
function select(state: ReturnType<typeof withNote>, value: string) {
  const from = textPos(state, value);
  return state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, from, from + value.length)),
  );
}

describe('Comments and suggestions in a footnote', () => {
  it('DOCE-COMMENTS-1.15 anchors a thread in a footnote’s text, its target naming the footnote', () => {
    const state = runCommand(select(withNote(), 'wording'), addCommentAnchor('t1'));
    const [anchor] = listCommentAnchors(state.doc);
    expect(anchor?.thread).toBe('t1');
    expect(state.doc.textBetween(anchor?.from ?? 0, anchor?.to ?? 0)).toBe('wording');
    const target = describeCommentTarget(state, 't1');
    expect(target?.quote).toBe('wording');
    // A footnote's text has no element id of its own: the target names the footnote's.
    expect(target?.ranges).toEqual([{ element: 'n1', start: 4, end: 11, text: 'wording' }]);
    // The target finds the text again in the footnote, after the body text before it changed.
    const edited = state.apply(state.tr.insertText('More ', textPos(state, 'Body')));
    const moved = target && resolveCommentTarget(edited.doc, target);
    expect(moved?.exact).toBe(true);
    const [range] = moved?.ranges ?? [];
    expect(edited.doc.textBetween(range?.from ?? 0, range?.to ?? 0)).toBe('wording');
  });

  it('DOCE-COMMENTS-1.15 records a suggestion typed in a footnote, which its thread then names', () => {
    const state = caretAt(withNote(), 'wording');
    const typed = state.tr.insertText('new ');
    const rewritten = suggestTransaction(typed, state, {
      author: 'writer',
      newId: () => 's0000001',
    });
    if (!rewritten) throw new Error('The change should be suggested.');
    const suggested = state.apply(rewritten);
    expect(listSuggestions(suggested.doc)).toEqual([
      expect.objectContaining({ id: 's0000001', author: 'writer', inserted: 'new ' }),
    ]);
    const linked = runCommand(suggested, linkSuggestionThread('s0000001', 't2'));
    expect(listSuggestions(linked.doc)[0]?.thread).toBe('t2');
    expect(linked.doc.resolve(textPos(linked, 'new ')).parent.type.name).toBe(
      state.doc.resolve(textPos(state, 'wording')).parent.type.name,
    );
  });
});
