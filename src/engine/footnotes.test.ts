import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  caretAt,
  footnoteParts,
  footnoteState,
  note,
  paragraph,
  runCommand,
  text,
  textPos,
} from '../../test/footnote-fixtures.js';
import { readDocumentFile } from '../model/index.js';
import { createTableFigure } from '../model/schema/caption-content.js';
import { documentKeys } from './document-editing.js';
import { numberFootnotes } from './footnote-model.js';
import {
  canInsertFootnote,
  createFootnotes,
  deleteFootnote,
  editFootnote,
  FOOTNOTE_FLASH_MS,
  footnoteAt,
  goToFootnoteMarker,
  insertFootnote,
  listFootnotes,
} from './footnotes.js';
import {
  createSectionFootnoteNumbers,
  sectionFootnoteNumbersKey,
} from './section-footnote-numbers.js';
import { markRemote } from './transaction-kind.js';

// Two sections, the first citing two footnotes and the second one.
const twoSections = () =>
  readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [paragraph(text('One'), note('a', 'A'), text(' two'), note('b', 'B'))],
        },
        { name: null, content: [paragraph(text('Three'), note('c', 'C'))] },
      ],
    },
    documentSchema,
  ).doc;

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

  it('DOCE-FOOTNOTES-1.1 gives a marker inside a comment or suggestion that comment or suggestion', () => {
    const plain = footnoteState([paragraph(text('Inside the remark.'))]);
    const comment = documentSchema.mark('comment_highlight', { commentId: 'c1' });
    const from = textPos(plain, 'Inside');
    const marked = plain.apply(plain.tr.addMark(from, from + 'Inside the remark'.length, comment));
    const state = runCommand(caretAt(marked, 'the', -1), insertFootnote({ newId: () => 'n1' }));
    let marks: readonly string[] = [];
    state.doc.descendants((node) => {
      if (node.type.name === 'footnote_reference') marks = node.marks.map((m) => m.type.name);
    });
    expect(marks).toEqual(['comment_highlight']);
    const edge = runCommand(caretAt(marked, 'remark', 6), insertFootnote({ newId: () => 'n2' }));
    edge.doc.descendants((node) => {
      if (node.type.name === 'footnote_reference') marks = node.marks.map((m) => m.type.name);
    });
    expect(marks).toEqual([]);
  });

  it('DOCE-FOOTNOTES-1.2 is refused outside a paragraph of the body', () => {
    const state = caretAt(
      footnoteState([{ type: 'heading', attrs: { level: 1 }, content: [text('Title')] }]),
      'Title',
    );
    expect(canInsertFootnote(state)).toBe(false);
    expect(insertFootnote()(state)).toBe(false);
  });

  it('DOCE-FOOTNOTES-1.2 is refused in script output, allowed in body and header cells', () => {
    const block = documentSchema.node.bind(documentSchema);
    const para = (value: string) => block('paragraph', null, documentSchema.text(value));
    const row = block('table_row', null, [
      block('table_header', null, para('Head')),
      block('table_cell', null, para('Cell')),
    ]);
    // A table sits in the node holding it with its caption.
    const table = createTableFigure(documentSchema, block('table', null, row));
    if (!table) throw new Error('No table');
    const list = block('bullet_list', null, block('list_item', null, para('Output')));
    const script = block('script_block', null, list);
    let state = footnoteState([paragraph(text('Body text'))]);
    const start = caretAt(state, 'Body').selection.$from.before();
    state = state.apply(state.tr.insert(start, [table, script]));
    expect(caretAt(state, 'Cell', 1).selection.$from.node(-3).type.name).toBe('table');
    expect(canInsertFootnote(caretAt(state, 'Cell', 1))).toBe(true);
    expect(canInsertFootnote(caretAt(state, 'Head', 1))).toBe(true);
    expect(canInsertFootnote(caretAt(state, 'Output', 1))).toBe(false);
  });

  it('DOCE-FOOTNOTES-1.2 cites a footnote in a figure or table caption, numbered in reading order', () => {
    const caption = (...content: Parameters<typeof paragraph>) => ({ type: 'caption', content });
    let state = footnoteState([
      paragraph(text('Intro'), note('n1', 'First')),
      { type: 'figure', attrs: { src: 'sample.png' }, content: [caption(text('Chart'))] },
      {
        type: 'table',
        content: [
          caption(text('Totals'), note('n3', 'Third')),
          {
            type: 'table_row',
            content: [{ type: 'table_cell', content: [paragraph(text('Cell'))] }],
          },
        ],
      },
    ]);
    const markers = (by: 'id' | 'number') =>
      footnoteParts(state, by).filter((part) => part.startsWith('marker:'));
    expect(markers('id')).toEqual(['marker:n1', 'marker:n3']);
    expect(canInsertFootnote(caretAt(state, 'Chart', 5))).toBe(true);
    state = runCommand(caretAt(state, 'Chart', 5), insertFootnote({ newId: () => 'n2' }));
    expect(state.doc.nodeAt(textPos(state, 'Chart', 5))?.type.name).toBe('footnote_reference');
    expect(markers('id')).toEqual(['marker:n1', 'marker:n2', 'marker:n3']);
    expect(markers('number')).toEqual(['marker:1', 'marker:2', 'marker:3']);
  });

  it('DOCE-FOOTNOTES-1.2 is refused in the caption the pages repeat on a later part of a table', () => {
    const block = documentSchema.node.bind(documentSchema);
    const cell = block('table_cell', null, block('paragraph', null, documentSchema.text('Cell')));
    const table = createTableFigure(
      documentSchema,
      block('table', null, block('table_row', null, cell)),
    );
    if (!table?.firstChild) throw new Error('No table');
    let state = footnoteState([paragraph(text('Body text'))]);
    const start = caretAt(state, 'Body').selection.$from.before();
    state = state.apply(state.tr.insert(start, table));
    const captionAt = start + 2;
    const repeated = state.apply(
      state.tr.setNodeAttribute(start + 1, 'continuedText', 'Totals (continued)'),
    );
    const at = (s: EditorState) =>
      s.apply(s.tr.setSelection(TextSelection.create(s.doc, captionAt)));
    expect(canInsertFootnote(at(state))).toBe(true);
    expect(canInsertFootnote(at(repeated))).toBe(false);
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

  it("DOCE-FOOTNOTES-1.7 shows by double click a marker's entry and an entry's marker, for a moment, the caret staying", () => {
    vi.useFakeTimers();
    try {
      const state = caretAt(footnoteState([paragraph(text('One'), note('n1', 'First'))]), 'One');
      const view = new EditorView(document.createElement('div'), { state, editable: () => false });
      const plugin = createFootnotes();
      const click = (selector: string) => {
        const target = view.dom.querySelector(selector);
        if (!target || !plugin.props.handleDoubleClick) throw new Error(`No ${selector}`);
        const event = new MouseEvent('dblclick');
        Object.defineProperty(event, 'target', { value: target });
        return plugin.props.handleDoubleClick.call(plugin, view, 0, event);
      };
      const caret = view.state.selection;
      const revealed = () =>
        view.dom.querySelector('[data-de-revealed]')?.getAttribute('data-de-revealed');
      expect(click('.pm-footnote-entry-content')).toBe(false);
      expect(click('[data-footnote-reference]')).toBe(true);
      expect(revealed()).toBe('entry');
      expect(view.state.selection.eq(caret)).toBe(true);
      vi.advanceTimersByTime(FOOTNOTE_FLASH_MS);
      expect(revealed()).toBeUndefined();
      expect(click('.pm-footnote-entry-number')).toBe(true);
      expect(revealed()).toBe('marker');
      expect(view.state.selection.eq(caret)).toBe(true);
      view.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('DOCE-FOOTNOTES-1.4 refuses to go to a footnote that is not there', () => {
    const state = footnoteState([paragraph(text('One'))]);
    expect(editFootnote('none')(state)).toBe(false);
    expect(goToFootnoteMarker('none')(state)).toBe(false);
    expect(deleteFootnote('none')(state)).toBe(false);
  });

  it('DOCE-FOOTNOTES-2.1 numbers footnotes from 1 in each section, when enabled', () => {
    let enabled = true;
    let state = EditorState.create({
      doc: twoSections(),
      plugins: [createSectionFootnoteNumbers({ enabled: () => enabled })],
    });
    state = state.apply(state.tr.setMeta(sectionFootnoteNumbersKey, true));
    expect(footnoteParts(state, 'number')).toEqual([
      'marker:1',
      'marker:2',
      'entry:1:A',
      'entry:2:B',
      'marker:1',
      'entry:1:C',
    ]);
    // Switched off, as on pages, it leaves the numbers to others: here, document order.
    enabled = false;
    const tr = state.tr;
    expect(numberFootnotes(tr)).toBe(true);
    expect(footnoteParts(state.apply(tr), 'number').slice(4)).toEqual(['marker:3', 'entry:3:C']);
  });

  it('DOCE-FOOTNOTES-2.1 DOCE-EDITING-3.3 leaves the numbers of a remote change as they came', () => {
    const numbers = createSectionFootnoteNumbers({ enabled: () => true });
    const state = EditorState.create({ doc: twoSections(), plugins: [numbers] });
    // Another writer's change, numbered by their layout: here across the document.
    const split = () => {
      const tr = state.tr.split(textPos(state, ' two'));
      numberFootnotes(tr);
      return tr;
    };
    const asTheyCame = ['marker:1', 'marker:2', 'entry:1:A', 'entry:2:B', 'marker:3', 'entry:3:C'];
    expect(footnoteParts(state.apply(markRemote(split())), 'number')).toEqual(asTheyCame);
    expect(footnoteParts(state.apply(split()), 'number').slice(4)).toEqual([
      'marker:1',
      'entry:1:C',
    ]);
  });
});
