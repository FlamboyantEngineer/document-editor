import { TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  caretAt,
  footnoteParts,
  footnoteState,
  note,
  paragraph,
  runCommand,
  text,
} from '../../test/footnote-fixtures.js';
import { documentKeys } from './document-editing.js';
import {
  canInsertFootnote,
  createFootnotes,
  deleteFootnote,
  editFootnote,
  footnoteAt,
  goToFootnoteMarker,
  insertFootnote,
  listFootnotes,
} from './footnotes.js';

describe('footnotes', () => {
  it('DOCE-FOOTNOTES-1.1 inserts a marker and an entry in marker order, with the caret in the entry', () => {
    let state = footnoteState([paragraph(text('Before after.'), note('n1', 'Old'))]);
    state = caretAt(state, 'after', -1);
    state = runCommand(state, insertFootnote({ newId: () => 'n0' }));
    expect(state.selection.$from.parent.type.name).toBe('footnote_entry');
    expect(state.selection.$from.parent.attrs.footnoteId).toBe('n0');
    expect(footnoteParts(state)).toEqual(['marker:n0', 'marker:n1', 'entry:n0:', 'entry:n1:Old']);
    expect(footnoteParts(state, 'number')).toEqual([
      'marker:1',
      'marker:2',
      'entry:1:',
      'entry:2:Old',
    ]);
    const key = documentKeys(documentSchema)['Mod-Alt-f'];
    expect(key?.(caretAt(state, 'Before'))).toBe(true);
  });

  it('DOCE-FOOTNOTES-1.1 puts an entry cited last after the others', () => {
    let state = footnoteState([paragraph(text('One'), note('n1', 'First'), text(' end'))]);
    state = runCommand(caretAt(state, 'end', 3), insertFootnote({ newId: () => 'n2' }));
    expect(footnoteParts(state)).toEqual(['marker:n1', 'marker:n2', 'entry:n1:First', 'entry:n2:']);
  });

  it('DOCE-FOOTNOTES-1.2 is refused outside a paragraph of the body', () => {
    const state = caretAt(
      footnoteState([{ type: 'heading', attrs: { level: 1 }, content: [text('Title')] }]),
      'Title',
    );
    expect(canInsertFootnote(state)).toBe(false);
    expect(insertFootnote()(state)).toBe(false);
  });

  it('DOCE-FOOTNOTES-1.2 is refused in a header cell and in script output, allowed in a body cell', () => {
    const block = documentSchema.node.bind(documentSchema);
    const para = (value: string) => block('paragraph', null, documentSchema.text(value));
    const row = block('table_row', null, [
      block('table_header', null, para('Head')),
      block('table_cell', null, para('Cell')),
    ]);
    const table = block('table', null, row);
    const list = block('bullet_list', null, block('list_item', null, para('Output')));
    const script = block('script_block', null, list);
    let state = footnoteState([paragraph(text('Body text'))]);
    const start = caretAt(state, 'Body').selection.$from.before();
    state = state.apply(state.tr.insert(start, [table, script]));
    expect(canInsertFootnote(caretAt(state, 'Cell', 1))).toBe(true);
    expect(canInsertFootnote(caretAt(state, 'Head', 1))).toBe(false);
    expect(canInsertFootnote(caretAt(state, 'Output', 1))).toBe(false);
  });

  it('DOCE-FOOTNOTES-1.2 lets the host choose the places with citingPlaces', () => {
    const quote: Parameters<typeof footnoteState>[0] = [
      { type: 'blockquote', content: [paragraph(text('Quoted'))] },
    ];
    expect(canInsertFootnote(caretAt(footnoteState(quote), 'Quoted'))).toBe(true);
    const strict = footnoteState(quote, { citingPlaces: ['list_item'] });
    expect(canInsertFootnote(caretAt(strict, 'Quoted'))).toBe(false);
  });

  it('DOCE-FOOTNOTES-1.4 finds the footnote at the selection and deletes it whole', () => {
    let state = footnoteState([paragraph(text('One'), note('n1', 'First'))]);
    state = caretAt(state, 'First');
    expect(footnoteAt(state)?.id).toBe('n1');
    state = runCommand(state, deleteFootnote('n1'));
    expect(listFootnotes(state.doc).size).toBe(0);
  });

  it('DOCE-FOOTNOTES-1.4 goes from a marker to its entry and back, marking where it arrives', () => {
    const state = footnoteState([paragraph(text('One'), note('n1', 'First'), text(' two'))]);
    const view = new EditorView(document.createElement('div'), { state });
    expect(editFootnote('n1')(view.state, view.dispatch)).toBe(true);
    expect(footnoteAt(view.state)?.id).toBe('n1');
    expect(view.dom.querySelector('[data-de-revealed]')).toHaveAttribute(
      'data-de-revealed',
      'entry',
    );
    expect(view.dom.querySelector('[data-de-revealed]')).toHaveTextContent('First');
    expect(goToFootnoteMarker('n1')(view.state, view.dispatch)).toBe(true);
    expect(view.state.selection.$from.nodeBefore?.type.name).toBe('footnote_reference');
    const marker = view.dom.querySelector('[data-de-revealed]');
    expect(marker).toHaveAttribute('data-de-revealed', 'marker');
    expect(marker).toHaveAttribute('data-footnote-reference', 'true');
    // Moving on forgets where the reader arrived.
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, view.state.selection.from + 2),
      ),
    );
    expect(view.dom.querySelector('[data-de-revealed]')).toBeNull();
    view.destroy();
  });

  it('DOCE-FOOTNOTES-1.4 goes by double click from a marker to its entry and from its number back', () => {
    const state = footnoteState([paragraph(text('One'), note('n1', 'First'))]);
    const view = new EditorView(document.createElement('div'), { state });
    const plugin = createFootnotes();
    const click = (selector: string) => {
      const target = view.dom.querySelector(selector);
      if (!target || !plugin.props.handleDoubleClick) throw new Error(`No ${selector}`);
      const event = new MouseEvent('dblclick');
      Object.defineProperty(event, 'target', { value: target });
      return plugin.props.handleDoubleClick.call(plugin, view, 0, event);
    };
    expect(click('.pm-footnote-entry-content')).toBe(false);
    expect(click('.pm-footnote-entry-number')).toBe(true);
    expect(view.state.selection.$from.nodeBefore?.attrs.footnoteId).toBe('n1');
    expect(click('[data-footnote-reference]')).toBe(true);
    expect(footnoteAt(view.state)?.entry).not.toBeNull();
    expect(view.state.selection.$from.parent.type.name).toBe('footnote_entry');
    view.destroy();
  });

  it('DOCE-FOOTNOTES-1.4 refuses to go to a footnote that is not there', () => {
    const state = footnoteState([paragraph(text('One'))]);
    expect(editFootnote('none')(state)).toBe(false);
    expect(goToFootnoteMarker('none')(state)).toBe(false);
    expect(deleteFootnote('none')(state)).toBe(false);
  });
});
