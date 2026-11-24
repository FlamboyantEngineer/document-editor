import type { Node } from 'prosemirror-model';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { node, page, pagesDocument, pagesState, stubEngine } from '../../test/pages-fixtures.js';
import { BASE_TEMPLATE, type TemplateFile } from '../model/index.js';
import { engineNumbers } from '../pagination/engine-numbers.js';
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

  it('DOCE-PAGINATION-13.3 draws math as the pages typeset it, and the line end after it', () => {
    const math = (latex: string) => node('math_inline', null, [documentSchema.text(latex)]);
    const display = node('math_display', null, [documentSchema.text('y')]);
    const doc = pagesDocument([
      page([
        paragraph([math('x'), text('aaaaaaa'), math('bad'), math('later')], { dataId: 'p1' }),
        display,
      ]),
    ]);
    const state = pagesState(doc, stubEngine({ perLine: 3 }));
    const typeset = {
      tag: 'math',
      attrs: { display: 'inline' },
      children: [{ tag: 'mi', attrs: {}, children: ['x'] }],
    };
    const layout = pagesLayout(state, {
      typesetOf: (each) => {
        if (each.textContent === 'x') return { state: 'ready', math: typeset };
        if (each.textContent === 'y') return { state: 'ready', math: { ...typeset, attrs: {} } };
        if (each.textContent === 'bad') return { state: 'invalid', text: 'Bad', message: 'why' };
        return null;
      },
    });
    if (!layout) throw new Error('no layout');
    const printed = new DOMParser().parseFromString(
      renderLayoutPrintPage(layout, BASE_TEMPLATE),
      'text/html',
    );
    const drawn = [...printed.querySelectorAll<HTMLElement>('.de-math')].map((each) => ({
      display: each.dataset.display,
      state: each.dataset.state,
      html: each.innerHTML,
    }));
    expect(drawn).toEqual([
      { display: 'inline', state: 'ready', html: '<math display="inline"><mi>x</mi></math>' },
      { display: 'inline', state: 'invalid', html: 'Bad' },
      { display: 'inline', state: 'pending', html: 'later' },
      { display: 'display', state: 'ready', html: '<math><mi>x</mi></math>' },
    ]);
    // The math that ends the first line takes its end hook on its own element.
    const first = printed.querySelector('.de-math');
    expect(first?.classList.contains('de-forced-lines__end')).toBe(true);
  });

  it('DOCE-PAGINATION-9.12 draws each forced block in the direction the pages view draws it', () => {
    const doc = pagesDocument([
      page([
        paragraph([text('\u05e9\u05dc\u05d5\u05dd world')], { dataId: 'h' }),
        paragraph([text('hello')], { dataId: 'l' }),
      ]),
      page([paragraph([text('later part')], { dataId: 'h', splitPartIndex: 1 })]),
    ]);
    const { view, printed } = bothDrawings(doc);
    const directions = (root: ParentNode) =>
      [...root.querySelectorAll<HTMLElement>('p.de-forced-lines')].map((each) => each.dir);
    expect(directions(printed)).toEqual(['rtl', 'ltr', 'rtl']);
    expect(directions(printed)).toEqual(directions(view));
  });

  it('DOCE-PAGINATION-9.12 prints a block, and its later part, in its first strong character’s Bidi_Class', () => {
    const doc = pagesDocument([
      page([
        paragraph([text('\u2162 \u05e9\u05dc\u05d5\u05dd')], { dataId: 'n' }),
        paragraph([text('\u0640abc')], { dataId: 't' }),
      ]),
      page([paragraph([text('\u05e9\u05dc\u05d5\u05dd')], { dataId: 'n', splitPartIndex: 1 })]),
    ]);
    const { view, printed } = bothDrawings(doc);
    const directions = (root: ParentNode) =>
      [...root.querySelectorAll<HTMLElement>('p.de-forced-lines')].map((each) => each.dir);
    expect(directions(printed)).toEqual(['ltr', 'rtl', 'ltr']);
    expect(directions(printed)).toEqual(directions(view));
  });

  it('DOCE-PAGINATION-13.10 prints in the language the pages were laid out in', () => {
    const doc = pagesDocument([page([paragraph([text('kış')], { dataId: 'p' })])]);
    const printed = (language?: string) => {
      const engine = language === undefined ? stubEngine() : { ...stubEngine(), language };
      const layout = pagesLayout(pagesState(doc, engine));
      if (!layout) throw new Error('no layout');
      return new DOMParser().parseFromString(
        renderLayoutPrintPage(layout, BASE_TEMPLATE),
        'text/html',
      );
    };
    expect(printed('tr').documentElement.lang).toBe('tr');
    expect(printed().documentElement.outerHTML).toMatch(/^<html>/u);
  });

  it('DOCE-PAGINATION-12.4 draws a reserved cluster in its box inside a line end, as the view does', () => {
    const doc = pagesDocument([page([paragraph([text('aaaa☃bb☃c')], { dataId: 'p1' })])]);
    const engine = stubEngine({ perLine: 5, reserved: new Set(['☃']) });
    const { view, printed } = bothDrawings(doc, engine);
    const drawn = view.querySelector('p');
    expect(printed.querySelector('p')?.innerHTML).toBe(drawn?.innerHTML);
    const boxes = [...(drawn?.querySelectorAll('.de-forced-lines__reserved') ?? [])];
    expect(boxes.map((box) => [box.textContent, box.getAttribute('style')])).toEqual([
      ['☃', '--de-reserved-width: 16.000px;'],
      ['☃', '--de-reserved-width: 16.000px;'],
    ]);
    // The first ends its line: the line end's element holds the box, so its line feed is outside.
    expect(boxes[0]?.parentElement?.className).toBe('de-forced-lines__end');
    // Inside a justified line, with a line end and an indent beside it.
    const justified = pagesDocument([page([paragraph([text('a ☃ b ☃ c☃')], { dataId: 'p2' })])]);
    const both = bothDrawings(
      justified,
      stubEngine({ perLine: 4, left: 6, justify: true, reserved: new Set(['☃']) }),
    );
    const view2 = both.view.querySelector('p');
    expect(both.printed.querySelector('p')?.innerHTML).toBe(view2?.innerHTML);
    for (const box of view2?.querySelectorAll('.de-forced-lines__reserved') ?? [])
      expect(box.childElementCount).toBe(0);
  });

  it('DOCE-PAGINATION-11.13 draws a page variable in the text in its box, with its line end, as the view does', () => {
    const variable = (key: string) => node('template_variable', { variableKey: key });
    const doc = pagesDocument([
      page([
        paragraph([text('Page '), variable('page.current'), text(' of '), variable('page.total')], {
          dataId: 'p1',
        }),
      ]),
    ]);
    // The first line ends at the page's number.
    const { view, printed } = bothDrawings(doc, stubEngine({ perLine: 7, pageBox: 24 }));
    const hooks = (root: ParentNode) =>
      [...root.querySelectorAll('p [data-template-variable]')].map((each) => [
        each.className,
        each.getAttribute('style'),
        each.firstElementChild?.textContent,
      ]);
    expect(hooks(view)).toEqual([
      ['de-forced-lines__reserved de-forced-lines__end', '--de-reserved-width: 24.000px;', '1'],
      ['de-forced-lines__reserved', '--de-reserved-width: 24.000px;', '1'],
    ]);
    expect(hooks(printed)).toEqual(hooks(view));
  });

  it('DOCE-PAGINATION-13.3 draws numbered headings, indents and justified lines', () => {
    const heading = node('heading', { level: 1, dataId: 'h1' }, [text('Scope of the plan')]);
    const doc = pagesDocument([page([heading])]);
    const engine = stubEngine({ left: 12, justify: true, headings: new Map([[5, '1 ']]) });
    const { view, printed } = bothDrawings(doc, engine);
    const static_ = printed.querySelector('h1');
    expect(static_?.getAttribute('data-number')).toBe('1 ');
    expect(static_?.innerHTML).toBe(view.querySelector('h1')?.innerHTML);
    // The first line's indent is the heading's, before its number; later lines start indented.
    expect(static_?.getAttribute('style')).toBe('--de-first-indent: 12.000px');
    expect(view.querySelector('h1')?.getAttribute('style')).toBe('--de-first-indent: 12.000px;');
    expect(static_?.querySelector('.de-forced-lines__start')?.getAttribute('style')).toBe(
      '--de-line-indent: 12.000px;',
    );
    expect(static_?.querySelector('.de-forced-lines__justified')?.getAttribute('style')).toBe(
      '--de-word-spacing: 45.000px;',
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
    expect(section?.pages.map((each) => each.html())).toEqual(
      [...printed.querySelectorAll('.pm-page')].map((each) => each.innerHTML),
    );
    // Its anchors are the ids its drawn content keeps, known before it is drawn.
    for (const each of section?.pages ?? []) {
      const ids = [
        ...new DOMParser().parseFromString(each.html(), 'text/html').querySelectorAll('[id]'),
      ];
      expect(each.anchors).toEqual(ids.map((element) => element.id));
    }
  });
});

describe("the engine's numbers in static pages", () => {
  it('DOCE-PAGINATION-13.7 draws the numbers the engine laid the pages out with', () => {
    const heading = node('heading', { level: 1, dataId: 'h1' }, [text('Scope')]);
    const equation = node('math_display', { dataId: 'eq1' }, [documentSchema.text('a^2')]);
    const doc = pagesDocument([page([heading, equation])]);
    let at = -1;
    doc.descendants((each, pos) => {
      if (each.type.name === 'heading') at = pos;
    });
    const engine = {
      ...stubEngine({ headings: new Map([[at, '4']]) }),
      template: BASE_TEMPLATE,
    };
    const numbers = engineNumbers({ engine: () => engine, canonical: () => doc });
    const layout = pagesLayout(pagesState(doc, engine, [numbers]));
    if (!layout) throw new Error('no layout');
    expect(layout.numbers.map((each) => [each.pos, each.number, each.heading])).toEqual([
      [at, '4', true],
      [at + heading.nodeSize, '(Eq. 1.1.)', false],
    ]);
    const printed = new DOMParser().parseFromString(
      renderLayoutPrintPage(layout, BASE_TEMPLATE),
      'text/html',
    );
    expect(printed.querySelector('h1')?.getAttribute('data-number')).toBe('4');
    const drawn = printed.querySelector<HTMLElement>('[data-id="eq1"]');
    expect(drawn?.style.getPropertyValue('--de-number')).toBe('"(Eq. 1.1.)"');
  });
});

describe('served faces in static pages', () => {
  it('DOCE-PAGINATION-13.8 prints the layout in the served faces the engine measured with', () => {
    const bytes = new Uint8Array([0x77, 0x4f, 0x46, 0x46]);
    const fonts = {
      faces: [{ family: 'Tinos', weight: 400, style: 'normal' as const, bytes }],
      generics: { serif: 'Tinos' },
    };
    const engine = { ...stubEngine(), fonts: () => fonts };
    const doc = pagesDocument([page([paragraph([text('Served')], { dataId: 'p1' })])]);
    const layout = pagesLayout(pagesState(doc, engine));
    if (!layout) throw new Error('no layout');
    expect(layout.fonts).toBe(fonts);
    const styles = BASE_TEMPLATE.styles ?? {};
    const serif: TemplateFile = {
      ...BASE_TEMPLATE,
      styles: { ...styles, paragraph: { ...styles.paragraph, font: 'Serif' } },
    };
    const rules = new DOMParser().parseFromString(renderLayoutPrintPage(layout, serif), 'text/html')
      .head.textContent;
    expect(rules).toContain(
      `@font-face { font-family: "Tinos"; src: url(data:font/woff;base64,${btoa('wOFF')});`,
    );
    // The paragraph font the template names as the generic serif is the served family.
    expect(rules).toMatch(/--doc-[a-z-]*font-family: Tinos/u);
  });

  it('DOCE-PAGINATION-13.8 holds no faces when the host serves none', () => {
    const doc = pagesDocument([page([paragraph([text('Plain')], { dataId: 'p1' })])]);
    const layout = pagesLayout(pagesState(doc, stubEngine()));
    expect(layout?.fonts).toBeNull();
    expect(layout && renderLayoutPrintPage(layout, BASE_TEMPLATE)).not.toContain('@font-face');
  });
});

// Two pages as a table's repeated header row draws them: a note cited before the table on the first
// page, and the header's note cited on both, its entry on each page.
function repeatedHeaderNotes() {
  const marker = (id: string) => node('footnote_reference', { footnoteId: id });
  const entry = (id: string) => node('footnote_entry', { footnoteId: id }, [text(`Note ${id}.`)]);
  const notesPage = (blocks: Node[], ids: string[], pageNumber: number) =>
    node('page', null, [
      node('page_header', { pageNumber, totalPages: 2 }, []),
      node('page_content', null, blocks),
      node('page_footnotes', null, ids.map(entry)),
      node('page_footer', { pageNumber, totalPages: 2 }, []),
    ]);
  return pagesDocument([
    notesPage(
      [
        paragraph([text('Before'), marker('before')], { dataId: 'p1' }),
        paragraph([text('Header'), marker('head')], { dataId: 'h1' }),
      ],
      ['before', 'head'],
      1,
    ),
    notesPage([paragraph([text('Header'), marker('head')], { dataId: 'h1' })], ['head'], 2),
  ]);
}

describe('footnotes drawn on more than one page', () => {
  const drawnNotes = (footnoteNumbering: 'document' | 'page') => {
    const layout = pagesLayout(pagesState(repeatedHeaderNotes(), stubEngine()), {
      footnoteNumbering,
    });
    if (!layout) throw new Error('no layout');
    const printed = new DOMParser().parseFromString(
      renderLayoutPrintPage(layout, BASE_TEMPLATE),
      'text/html',
    );
    return [...printed.querySelectorAll('.pm-page')].map((sheet) => ({
      markers: [...sheet.querySelectorAll('sup.footnote-reference')].map((each) => ({
        number: each.textContent,
        id: each.id,
        href: each.querySelector('a')?.getAttribute('href'),
      })),
      entries: [...sheet.querySelectorAll('.pm-footnote-entry')].map((each) => ({
        number: each.querySelector('.pm-footnote-entry-number')?.textContent,
        id: each.id,
        href: each.querySelector('.pm-footnote-entry-number > a')?.getAttribute('href'),
      })),
    }));
  };

  it('DOCE-PAGINATION-13.11 numbers a repeated header’s note by the page each occurrence is on', () => {
    const [first, second] = drawnNotes('page');
    expect(first?.markers.map((each) => each.number)).toEqual(['1', '2']);
    expect(first?.entries.map((each) => each.number)).toEqual(['1', '2']);
    expect(second?.markers.map((each) => each.number)).toEqual(['1']);
    expect(second?.entries.map((each) => each.number)).toEqual(['1']);
  });

  it('DOCE-PAGINATION-13.11 links each page’s marker to that page’s entry and back', () => {
    for (const numbering of ['document', 'page'] as const) {
      const [first, second] = drawnNotes(numbering);
      expect(first?.markers[1]).toMatchObject({ id: 'fnref-head', href: '#fn-head' });
      expect(first?.entries[1]).toMatchObject({ id: 'fn-head', href: '#fnref-head' });
      expect(second?.markers[0]).toMatchObject({ id: 'fnref-head~2', href: '#fn-head~2' });
      expect(second?.entries[0]).toMatchObject({ id: 'fn-head~2', href: '#fnref-head~2' });
    }
    // Through the document, the header's note keeps its number on every page.
    expect(drawnNotes('document')[1]?.markers[0]?.number).toBe('2');
  });

  it('DOCE-PAGINATION-13.11 names each page’s own footnote anchors for the viewer', () => {
    const layout = pagesLayout(pagesState(repeatedHeaderNotes(), stubEngine()), {
      footnoteNumbering: 'page',
    });
    if (!layout) throw new Error('no layout');
    const [section] = drawLayoutPages(layout, BASE_TEMPLATE).sections;
    const notes = (anchors: readonly string[] = []) => anchors.filter((id) => id.startsWith('fn'));
    expect(notes(section?.pages[0]?.anchors)).toEqual([
      'fnref-before',
      'fnref-head',
      'fn-before',
      'fn-head',
    ]);
    expect(notes(section?.pages[1]?.anchors)).toEqual(['fnref-head~2', 'fn-head~2']);
    // Named before a page is drawn, and the ids its drawing then holds (DOCE-PAGINATION-13.6).
    for (const each of section?.pages ?? []) {
      const ids = [
        ...new DOMParser().parseFromString(each.html(), 'text/html').querySelectorAll('[id]'),
      ];
      expect(each.anchors).toEqual(ids.map((element) => element.id));
    }
  });
});
