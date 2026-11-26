import { EditorState } from 'prosemirror-state';
import { Transform } from 'prosemirror-transform';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  BASE_TEMPLATE,
  readDocumentFile,
  setPageRegions,
  type StoredNode,
} from '../model/index.js';
import { createPageVariables, refreshPageVariables } from './index.js';

const variable = (key: string): StoredNode => ({ type: 'variable', attrs: { key } });
const text = (value: string): StoredNode => ({ type: 'text', text: value });

function documentWithRegions() {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content: [] }] },
    documentSchema,
  ).doc;
  const template = {
    ...BASE_TEMPLATE,
    header: { content: [{ type: 'paragraph', content: [variable('document.name')] }] },
    footer: {
      content: [
        {
          type: 'paragraph',
          content: [variable('page.current'), text(' of '), variable('page.total')],
        },
      ],
    },
  };
  const filled = setPageRegions(new Transform(doc), template).doc;
  let footerPos = -1;
  filled.descendants((node, pos) => {
    if (node.type.name === 'page_footer') footerPos = pos;
    return footerPos < 0;
  });
  return { doc: filled, footerPos };
}

describe('page variables', () => {
  it('DOCE-PAGINATION-8.2 shows page numbers from the region and other values as stored', () => {
    const { doc, footerPos } = documentWithRegions();
    const named = (name: string) => ({ 'document.name': name });
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        doc: new Transform(doc).setDocAttribute('values', named('Interface notes')).doc,
        plugins: [createPageVariables()],
      }),
    });
    view.dispatch(
      view.state.tr
        .setNodeAttribute(footerPos, 'pageNumber', 2)
        .setNodeAttribute(footerPos, 'totalPages', 5),
    );
    const header = view.dom.querySelector('.pm-page-header');
    const footer = view.dom.querySelector('.pm-page-footer');
    expect(header?.textContent).toBe('Interface notes');
    expect(footer?.textContent).toBe('2 of 5');
    // Showing them again asks nothing; a stored text an edit changes shows at once.
    refreshPageVariables(view);
    expect(header?.textContent).toBe('Interface notes');
    view.dispatch(view.state.tr.setDocAttribute('values', named('Timing notes')));
    expect(view.dom.querySelector('.pm-page-header')?.textContent).toBe('Timing notes');
    view.destroy();
  });

  it('DOCE-PAGINATION-8.3 shows variables in the text, by the page they are on, and the stored date', () => {
    const doc = readDocumentFile(
      {
        formatVersion: 1,
        values: { 'date.current': 'February 3, 2026' },
        sections: [
          {
            name: null,
            content: [
              {
                type: 'paragraph',
                content: [
                  text('Page '),
                  variable('page.current'),
                  text(' of '),
                  variable('page.total'),
                  text(', '),
                  variable('date.current'),
                ],
              },
            ],
          },
        ],
      },
      documentSchema,
    ).doc;
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        doc,
        plugins: [createPageVariables()],
      }),
    });
    expect(view.dom.querySelector('.pm-page-content p')?.textContent).toBe(
      'Page 1 of 1, February 3, 2026',
    );
    view.destroy();
  });

  it('DOCE-PAGINATION-7.19 moves the values with text typed around them, and shows a variable added', () => {
    const doc = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [{ type: 'paragraph', content: [text('Page '), variable('page.current')] }],
          },
        ],
      },
      documentSchema,
    ).doc;
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc, plugins: [createPageVariables()] }),
    });
    const paragraph = () => view.dom.querySelector('.pm-page-content p')?.textContent;
    let start = -1;
    view.state.doc.descendants((node, pos) => {
      if (node.isText && start < 0) start = pos;
    });
    view.dispatch(view.state.tr.insertText('This ', start));
    expect(paragraph()).toBe('This Page 1');
    const end = view.state.doc.resolve(start).end();
    const added = documentSchema.nodes.template_variable?.create({ variableKey: 'page.total' });
    if (!added) throw new Error('The schema has no variables.');
    view.dispatch(view.state.tr.insertText(' of ', end).insert(end + 4, added));
    expect(paragraph()).toBe('This Page 1 of 1');
    view.destroy();
  });
});
