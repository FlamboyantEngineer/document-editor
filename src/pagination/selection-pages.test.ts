import { NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { node, page, pagesDocument, pagesState } from '../../test/pages-fixtures.js';
import { selectionPagesPlugin } from './selection-pages.js';

const paragraph = (text: string) => node('paragraph', null, [documentSchema.text(text)]);

// Three pages of one paragraph each.
const doc = pagesDocument([
  page([paragraph('First')]),
  page([paragraph('Second')]),
  page([paragraph('Third')]),
]);

// The start of a page's paragraph text, by page index.
function textStart(index: number): number {
  let found = -1;
  doc.descendants((child, pos) => {
    if (
      child.type.name === 'paragraph' &&
      child.textContent === ['First', 'Second', 'Third'][index]
    )
      found = pos + 1;
    return found < 0;
  });
  return found;
}

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
});

function marked(
  selection: (state: ReturnType<typeof pagesState>) => TextSelection | NodeSelection,
) {
  const state = pagesState(doc, null, [selectionPagesPlugin()]);
  view = new EditorView(document.createElement('div'), { state });
  view.dispatch(view.state.tr.setSelection(selection(view.state)));
  const pages = [...view.dom.querySelectorAll('.pm-page')];
  return pages.map((each) => each.getAttribute('data-selection-page') === 'true');
}

describe('selection pages', () => {
  it('DOCE-PAGINATION-11.6 marks the page holding the caret', () => {
    expect(marked((state) => TextSelection.create(state.doc, textStart(1)))).toEqual([
      false,
      true,
      false,
    ]);
  });

  it('DOCE-PAGINATION-11.6 marks the pages of both ends of a selection, not those between', () => {
    expect(marked((state) => TextSelection.create(state.doc, textStart(0), textStart(2)))).toEqual([
      true,
      false,
      true,
    ]);
  });

  it('DOCE-PAGINATION-11.6 marks the page of a selected block', () => {
    expect(marked((state) => NodeSelection.create(state.doc, textStart(2) - 1))).toEqual([
      false,
      false,
      true,
    ]);
  });

  it('DOCE-PAGINATION-11.6 keeps the mark on a page an edit replaces', () => {
    const state = pagesState(doc, null, [selectionPagesPlugin()]);
    view = new EditorView(document.createElement('div'), { state });
    const start = textStart(1);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, start)));
    const secondPage = view.state.doc.resolve(start).before(2);
    const replaced = view.state.doc.nodeAt(secondPage);
    if (!replaced) throw new Error('No second page.');
    // A layout puts a new page in its place, the caret on it again.
    const tr = view.state.tr.replaceWith(
      secondPage,
      secondPage + replaced.nodeSize,
      replaced.copy(replaced.content),
    );
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, start)));
    const pages = [...view.dom.querySelectorAll('.pm-page')];
    expect(pages.map((each) => each.hasAttribute('data-selection-page'))).toEqual([
      false,
      true,
      false,
    ]);
  });
});
