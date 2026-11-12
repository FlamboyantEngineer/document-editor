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
  it('DOCE-PAGINATION-8.2 shows page numbers from the region and other values from the host', () => {
    const { doc, footerPos } = documentWithRegions();
    let name = 'Interface notes';
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc, plugins: [createPageVariables({ value: () => name })] }),
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
    name = 'Timing notes';
    refreshPageVariables(view);
    expect(header?.textContent).toBe('Timing notes');
    view.destroy();
  });

  it('DOCE-PAGINATION-8.3 shows variables in the text, by the page they are on, and the date', () => {
    const doc = readDocumentFile(
      {
        formatVersion: 1,
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
        plugins: [createPageVariables({ now: () => new Date(2026, 1, 3), locale: 'en-US' })],
      }),
    });
    expect(view.dom.querySelector('.pm-page-content p')?.textContent).toBe(
      'Page 1 of 1, February 3, 2026',
    );
    view.destroy();
  });
});
