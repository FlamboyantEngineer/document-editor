import type { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { caretAt, footnoteState, note, paragraph, text } from '../../../test/footnote-fixtures.js';
import { DEFAULT_EDITOR_LABELS } from './editor-labels.js';
import { inFootnote, refuseInFootnote } from './footnote-keys.js';

// The document with a footnote, the caret in its text or in the body.
function stateIn(where: 'note' | 'body') {
  const state = footnoteState([paragraph(text('Body text'), note('note-1', 'Note text'))]);
  return caretAt(state, where === 'note' ? 'Note text' : 'Body text', 2);
}

// A key press the editor may take from the browser.
function press(init: KeyboardEventInit) {
  return new KeyboardEvent('keydown', { cancelable: true, ...init });
}

function refuse(where: 'note' | 'body', event: KeyboardEvent) {
  const notices: { tone: string; text: string }[] = [];
  const view = { state: stateIn(where) } as unknown as EditorView;
  const taken = refuseInFootnote(view, event, {
    labels: DEFAULT_EDITOR_LABELS,
    feedback: { notify: (notice) => notices.push(notice) },
  });
  return { taken, notices };
}

describe('footnote keys', () => {
  it('DOCE-EDITOR-4.14 tells whether the selection is in a footnote', () => {
    expect(inFootnote(stateIn('note'))).toBe(true);
    expect(inFootnote(stateIn('body'))).toBe(false);
  });

  it('DOCE-EDITOR-4.14 DOCE-EDITING-2.9 takes a block insert key in a footnote and says why', () => {
    const event = press({ key: 'Enter', ctrlKey: true, altKey: true });
    const { taken, notices } = refuse('note', event);
    expect(taken).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(notices).toEqual([{ tone: 'warning', text: DEFAULT_EDITOR_LABELS.reasonFootnote }]);
  });

  it('DOCE-EDITOR-4.14 leaves other keys, and block keys in the body, alone', () => {
    expect(refuse('note', press({ key: 'b', ctrlKey: true })).taken).toBe(false);
    const inBody = refuse('body', press({ key: 'Enter', ctrlKey: true, altKey: true }));
    expect(inBody).toEqual({ taken: false, notices: [] });
  });
});
