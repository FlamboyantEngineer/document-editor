import { TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { footnoteState, note, paragraph, text, textPos } from '../../test/footnote-fixtures.js';
import { listFootnotes } from './footnotes.js';

const bold = [{ type: 'strong' }];
const link = [{ type: 'link', attrs: { href: 'https://example.com' } }];

// The marks of a letter typed with the caret just after a footnote's marker.
function typedAfter(state: ReturnType<typeof footnoteState>, id: string) {
  const marker = listFootnotes(state.doc).get(id)?.marker ?? -1;
  let next = state.apply(state.tr.setSelection(TextSelection.create(state.doc, marker + 1)));
  next = next.apply(next.tr.insertText('x'));
  return next.doc.nodeAt(marker + 1)?.marks.map((mark) => mark.type.name);
}

describe('typing beside a footnote marker', () => {
  it('DOCE-FOOTNOTES-1.5 takes the marks of the text before the marker', () => {
    const state = footnoteState([
      paragraph(text('Bold', bold), note('n1', 'First'), text(' plain')),
    ]);
    expect(typedAfter(state, 'n1')).toEqual(['strong']);
  });

  it('DOCE-FOOTNOTES-1.5 does not carry a link past the marker into plain text', () => {
    const state = footnoteState([
      paragraph(text('Link', link), note('n1', 'First'), text(' plain')),
    ]);
    expect(typedAfter(state, 'n1')).toEqual([]);
  });

  it('DOCE-FOOTNOTES-1.5 takes the marks of the text after a marker that starts a paragraph', () => {
    let state = footnoteState([paragraph(note('n1', 'First'), text('Bold', bold))]);
    const start = textPos(state, 'Bold') - 1;
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, start)));
    expect(state.storedMarks?.map((mark) => mark.type.name)).toEqual(['strong']);
  });

  it('DOCE-FOOTNOTES-1.5 keeps marks the writer chose', () => {
    const state = footnoteState([paragraph(text('Plain'), note('n1', 'First'))]);
    const marker = listFootnotes(state.doc).get('n1')?.marker ?? -1;
    const strong = state.schema.marks.strong;
    if (!strong) throw new Error('No strong mark');
    const next = state.apply(
      state.tr
        .setSelection(TextSelection.create(state.doc, marker + 1))
        .setStoredMarks([strong.create()]),
    );
    expect(next.storedMarks?.map((mark) => mark.type.name)).toEqual(['strong']);
  });
});
