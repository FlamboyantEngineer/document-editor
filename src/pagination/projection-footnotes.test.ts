import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../../test/canvas-fixtures.js';
import { findNode } from '../../test/document-markup.js';
import { footnoteState, note, paragraph, text, textPos } from '../../test/footnote-fixtures.js';
import { heldEngine } from '../../test/pages-fixtures.js';
import { edit, mount } from '../../test/projection-fixtures.js';
import { renderLayoutPrintPage } from '../document/print-pages.js';
import { BASE_TEMPLATE, type ResolvedFootnoteSettings, type StoredNode } from '../model/index.js';
import { createPageVariables } from './page-variables.js';
import { createPagesTextEngine } from './text-engine.js';

type Numbering = ResolvedFootnoteSettings['numbering'];

const templateOf = (numbering: Numbering) => ({
  ...BASE_TEMPLATE,
  footnotes: { ...BASE_TEMPLATE.footnotes, numbering },
});

const variable = (key: string): StoredNode => ({ type: 'variable', attrs: { key } });

function stateWithFootnoteVariables(value: string) {
  const state = footnoteState([
    paragraph(text('First page')),
    { type: 'pageBreak' },
    paragraph(text('Body '), {
      type: 'footnote',
      attrs: { id: 'n1' },
      content: [
        text(`${'a'.repeat(30)} `),
        variable('document.title'),
        text(` ${'b'.repeat(30)} `),
        variable('page.current'),
        text(' of '),
        variable('page.total'),
      ],
    }),
  ]);
  return state.apply(state.tr.setDocAttribute('values', { 'document.title': value }));
}

it('DOCE-PAGINATION-8.3 DOCE-PAGINATION-11.10 DOCE-PAGINATION-11.13 measures footnote variables on the lines drawn in the view and print', () => {
  const template = {
    ...BASE_TEMPLATE,
    page: { ...BASE_TEMPLATE.page, margins: { left: '295px', right: '295px' } },
  };
  const engine = createPagesTextEngine({ template });
  const value = 'Z'.repeat(32);
  const { projection, drain } = mount({
    state: stateWithFootnoteVariables(value),
    plugins: [createPageVariables()],
    textEngine: heldEngine(engine),
  });
  try {
    const entry = () => {
      const area = projection.state.doc.child(0).child(0).child(2);
      return engine.regionLines(area, null).get(area.child(0));
    };
    const layout = () => {
      const result = projection.pagesLayout();
      if (!result) throw new Error('No pages layout');
      return result;
    };
    const verifyDrawing = (value: string) => {
      const lines = entry()?.lines.length;
      const view = projection.view.dom.querySelector('.pm-footnote-entry');
      if (!view) throw new Error('No drawn footnote');
      expect(view).toHaveAttribute('data-lines', String(lines));
      expect(shownNumbers(view, '[data-template-variable]')).toEqual([value, '2', '2']);
      const printed = new DOMParser().parseFromString(
        renderLayoutPrintPage(layout(), template),
        'text/html',
      );
      const printedFootnote = printed.querySelector('.pm-footnote-entry');
      if (!printedFootnote) throw new Error('No printed footnote');
      const printEntry = document.importNode(printedFootnote, true);
      expect(printEntry).toHaveAttribute('data-lines', String(lines));
      expect(shownNumbers(printEntry, '[data-template-variable]')).toEqual([value, '2', '2']);
      const pageNumber = printEntry.querySelector('[data-template-variable="page.current"]');
      expect(pageNumber?.classList.contains('de-forced-lines__reserved')).toBe(true);
    };
    verifyDrawing(value);
    const long = entry()?.lines.length ?? 0;
    edit(projection, (state) => state.tr.setDocAttribute('values', { 'document.title': 'Z' }));
    drain();
    verifyDrawing('Z');
    expect(entry()?.lines.length).toBeLessThan(long);
  } finally {
    projection.destroy();
    engine.destroy();
  }
});

function citedState() {
  const first = Array.from({ length: 9 }, (_, index) => note(`n${String(index + 1)}`, 'Note'));
  const state = footnoteState([
    paragraph(text('Lead '), ...first),
    { type: 'pageBreak' },
    paragraph(text('aaaa '), note('n10', 'Last note')),
    paragraph(text('Again')),
  ]).reconfigure({ plugins: [] });
  const reference = findNode(state.doc, 'footnote_reference');
  if (!reference) throw new Error('No first footnote');
  return state.apply(state.tr.insert(textPos(state, 'Again', 'Again'.length), reference));
}

function shownNumbers(page: Element, selector: string) {
  return [...page.querySelectorAll(selector)].map((element) => element.textContent);
}

beforeEach(() => {
  installFakeCanvas();
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('footnote numbering on the projection', () => {
  it.each([
    { template: 'document', override: 'page', mode: 'page' },
    { template: 'page', override: 'document', mode: 'document' },
    { template: 'page', override: undefined, mode: 'page' },
    { template: 'document', override: undefined, mode: 'document' },
  ] as const)(
    'DOCE-PAGINATION-7.2 DOCE-PAGINATION-13.2 DOCE-PAGINATION-13.12 lays, draws and exports $mode numbering with template $template and override $override',
    ({ template: templateMode, override, mode }) => {
      const template = templateOf(templateMode);
      const engine = createPagesTextEngine({ template });
      const { projection } = mount({
        state: citedState(),
        textEngine: heldEngine(engine),
        footnoteNumbering: override,
      });
      try {
        const lastPage = projection.view.dom.querySelectorAll('.pm-page')[1];
        if (!lastPage) throw new Error('No second page');
        const perPage = mode === 'page';
        const markers = perPage ? ['1', '2'] : ['10', '1'];
        const entries = perPage ? ['1', '2'] : ['10'];
        expect(shownNumbers(lastPage, '.footnote-reference')).toEqual(markers);
        expect(shownNumbers(lastPage, '.pm-footnote-entry-number')).toEqual(entries);

        const secondPage = projection.projection.doc.child(0).child(1);
        const block = secondPage.child(1).child(0);
        expect(engine.lines(block, { scope: null })?.lines[0]?.width).toBe(perPage ? 32 : 37);
        const area = secondPage.child(2);
        const entry = engine.regionLines(area, null).get(area.child(0));
        expect(entry?.lines[0]?.width).toBe(perPage ? 55 : 60);

        const layout = projection.pagesLayout();
        expect(layout?.footnoteNumbering).toBe(mode);
        expect(layout?.inputs.footnoteNumbering).toBe(override);
        if (!layout) throw new Error('No layout');
        const printed = new DOMParser().parseFromString(
          renderLayoutPrintPage(layout, template),
          'text/html',
        );
        const printedPage = printed.querySelectorAll('.pm-page')[1];
        if (!printedPage) throw new Error('No second printed page');
        expect(shownNumbers(printedPage, '.footnote-reference')).toEqual(markers);
        expect(shownNumbers(printedPage, '.pm-footnote-entry-number')).toEqual(entries);
      } finally {
        projection.destroy();
        engine.destroy();
      }
    },
  );

  it('DOCE-PAGINATION-7.2 uses the laid-out numbering mode when probing a typed paragraph', () => {
    const engine = createPagesTextEngine({ template: BASE_TEMPLATE });
    const { projection, drain } = mount({
      state: citedState(),
      textEngine: heldEngine(engine),
      footnoteNumbering: 'page',
    });
    const width = () => {
      const block = projection.projection.doc.child(0).child(1).child(1).child(0);
      return engine.lines(block, { scope: null })?.lines[0]?.width;
    };
    try {
      expect(width()).toBe(32);
      edit(projection, (state) => state.tr.insertText('a', textPos(state, 'aaaa')));
      drain();
      expect(projection.stats().layouts).toBe(1);
      expect(width()).toBe(38);
    } finally {
      projection.destroy();
      engine.destroy();
    }
  });

  it('DOCE-PAGINATION-7.2 follows a changed template when the caller leaves numbering open', () => {
    const first = createPagesTextEngine({ template: templateOf('document') });
    const second = createPagesTextEngine({ template: templateOf('page') });
    let current = first;
    const { projection, drain } = mount({
      state: citedState(),
      textEngine: { ...heldEngine(first), engine: () => current },
    });
    const secondPageMarkers = () => {
      const page = projection.view.dom.querySelectorAll('.pm-page')[1];
      if (!page) throw new Error('No second page');
      return shownNumbers(page, '.footnote-reference');
    };
    try {
      expect(secondPageMarkers()).toEqual(['10', '1']);
      current = second;
      projection.refresh();
      drain();
      expect(secondPageMarkers()).toEqual(['1', '2']);
      expect(projection.pagesLayout()?.footnoteNumbering).toBe('page');
      current = first;
      projection.refresh();
      drain();
      expect(secondPageMarkers()).toEqual(['10', '1']);
      expect(projection.pagesLayout()?.footnoteNumbering).toBe('document');
    } finally {
      projection.destroy();
      first.destroy();
      second.destroy();
    }
  });
});
