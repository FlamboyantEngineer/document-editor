import type { Node } from 'prosemirror-model';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { node, page, pagesDocument, pagesState, stubEngine } from '../../test/pages-fixtures.js';
import { BASE_TEMPLATE, type TemplateFile } from '../model/index.js';
import { pagesLayout } from '../pagination/pages-layout.js';
import { drawLayoutPages, renderLayoutPrintPage } from './print-pages.js';

const text = (value: string, marks: string[] = []) =>
  documentSchema.text(
    value,
    marks.map((name) => documentSchema.mark(name)),
  );
const paragraph = (content: Node[], attrs: Record<string, unknown> = {}) =>
  node('paragraph', attrs, content);

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
});

// The pages as the editor's view draws them, and as the static render draws their layout.
function bothDrawings(doc: Node, engine = stubEngine(), template: TemplateFile = BASE_TEMPLATE) {
  const state = pagesState(doc, engine);
  const view = new EditorView(document.createElement('div'), { state, editable: () => false });
  views.push(view);
  const layout = pagesLayout(state);
  if (!layout) throw new Error('no layout');
  const printed = new DOMParser().parseFromString(
    renderLayoutPrintPage(layout, template),
    'text/html',
  );
  return { view: view.dom, printed, rules: printed.head.textContent };
}

describe('renderLayoutPrintPage', () => {
  it('DOCE-PAGINATION-13.3 draws each forced block on its lines as the pages view draws it', () => {
    const doc = pagesDocument([
      page([
        paragraph([text('aaaaaa'), text('bbbbbbbbb', ['strong']), text('cccccccccc😀d')], {
          dataId: 'p1',
        }),
        paragraph([text('short')], { dataId: 'p2' }),
      ]),
    ]);
    const { view, printed } = bothDrawings(doc, stubEngine({ perLine: 7 }));
    const drawn = [...view.querySelectorAll('p')];
    const static_ = [...printed.querySelectorAll('p')];
    expect(static_.map((each) => each.innerHTML)).toEqual(drawn.map((each) => each.innerHTML));
    const hooks = (each: HTMLElement) => [each.className, each.dataset.lines];
    expect(static_.map(hooks)).toEqual(drawn.map(hooks));
    // A mark runs across a line end inside it: one element, its last character in the end hook.
    expect(static_[0]?.querySelectorAll('strong')).toHaveLength(1);
    expect(static_[0]?.querySelectorAll('.de-forced-lines__end')).toHaveLength(3);
  });

  it('DOCE-PAGINATION-13.3 draws numbered headings, indents and justified lines', () => {
    const heading = node('heading', { level: 1, dataId: 'h1' }, [text('Scope of the plan')]);
    const doc = pagesDocument([page([heading])]);
    const engine = stubEngine({ left: 12, justify: true, headings: new Map([[5, '1 ']]) });
    const { view, printed } = bothDrawings(doc, engine);
    const static_ = printed.querySelector('h1');
    expect(static_?.getAttribute('data-number')).toBe('1 ');
    expect(static_?.innerHTML).toBe(view.querySelector('h1')?.innerHTML);
    expect(static_?.querySelector('.de-forced-lines__start')?.getAttribute('style')).toBe(
      '--de-line-indent: 12.000px; --de-word-spacing: 45.000px;',
    );
  });

  it('DOCE-PAGINATION-13.4 prints every page with its own header and footer and variables', () => {
    const footer = [
      paragraph([
        text('Page '),
        node('template_variable', { variableKey: 'page.current' }),
        text(' of '),
        node('template_variable', { variableKey: 'page.total' }),
      ]),
    ];
    const header = [paragraph([text('Field notes')])];
    const doc = pagesDocument([
      page([paragraph([text('One')])], { header, footer, pageNumber: 1, totalPages: 3 }),
      page([paragraph([text('Two')])], { header, footer, pageNumber: 2, totalPages: 3 }),
      page([paragraph([text('Three')])], { header, footer, pageNumber: 3, totalPages: 3 }),
    ]);
    const { printed, rules } = bothDrawings(doc);
    const pages = [...printed.querySelectorAll('.pm-page')];
    expect(pages).toHaveLength(3);
    expect(pages.map((each) => each.querySelector('.pm-page-header')?.textContent)).toEqual([
      'Field notes',
      'Field notes',
      'Field notes',
    ]);
    expect(pages.map((each) => each.querySelector('.pm-page-footer')?.textContent)).toEqual([
      'Page 1 of 3',
      'Page 2 of 3',
      'Page 3 of 3',
    ]);
    const root = printed.querySelector('.de-document-editor');
    expect(root?.getAttribute('data-text-layout')).toBe('pretext');
    expect(root?.getAttribute('data-print')).toBe('true');
    expect(root?.firstElementChild?.className).toBe(
      'ProseMirror ui-rich-text-engine-content de-document-editor__content',
    );
    expect(rules).toContain('.pm-page { break-after: page; }');
    expect(rules).toMatch(/@page de-sheet-0 \{ size: [\d.]+px [\d.]+px; margin: 0; \}/);
  });

  it('DOCE-PAGINATION-13.4 puts each section on its sheet, in its scope, with list starts', () => {
    const template: TemplateFile = {
      ...BASE_TEMPLATE,
      sections: [{ name: 'appendix', page: { size: 'A4', orientation: 'landscape' } }],
    };
    const list = node('ordered_list', { order: 4 }, [
      node('list_item', null, [paragraph([text('Fourth')])]),
    ]);
    const doc = node('doc', null, [
      node('page_section', { sectionName: null }, [page([paragraph([text('Body')])])]),
      node('page_section', { sectionName: 'appendix' }, [page([list])]),
    ]);
    const { printed, rules } = bothDrawings(doc, stubEngine(), template);
    const sections = [...printed.querySelectorAll('.pm-section')];
    expect(sections[1]?.getAttribute('style')).toContain('--doc-page-width');
    expect(printed.querySelector('ol')?.getAttribute('style')).toBe('--de-list-start: 3');
    expect(rules).toContain('de-sheet-1');
    expect(rules).toContain(':nth-child(2) { page: de-sheet-1; }');
  });
});

describe('drawLayoutPages', () => {
  it('DOCE-PAGINATION-13.6 draws each page on its own as the print draws it', () => {
    const doc = pagesDocument([
      page([paragraph([text('first page text')], { dataId: 'p1' })], { totalPages: 2 }),
      page([paragraph([text('second page')], { dataId: 'p2' })], {
        pageNumber: 2,
        totalPages: 2,
      }),
    ]);
    const layout = pagesLayout(pagesState(doc, stubEngine({ perLine: 6 })));
    if (!layout) throw new Error('no layout');
    const drawing = drawLayoutPages(layout, BASE_TEMPLATE);
    const printed = new DOMParser().parseFromString(
      renderLayoutPrintPage(layout, BASE_TEMPLATE),
      'text/html',
    );
    const [section] = drawing.sections;
    expect(section?.attrs.class).toBe('pm-section');
    expect(section?.pages.map((each) => [each.pos, each.attrs.class])).toEqual([
      [1, 'pm-page'],
      [doc.child(0).child(0).nodeSize + 1, 'pm-page'],
    ]);
    expect(section?.pages.map((each) => each.html)).toEqual(
      [...printed.querySelectorAll('.pm-page')].map((each) => each.innerHTML),
    );
  });
});
