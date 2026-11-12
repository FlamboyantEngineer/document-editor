import { EditorState, Plugin } from 'prosemirror-state';
import { Transform } from 'prosemirror-transform';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  BASE_TEMPLATE,
  readDocumentFile,
  setPageRegions,
  type StoredNode,
  type TemplateFile,
  templatePageMetrics,
} from '../model/index.js';
import { createPageVariables } from '../pagination/index.js';
import { viewOnlyInline, viewOnlyWidget } from '../utils/view-only-decorations.js';
import { createSearch, setSearch } from './search.js';
import { documentSnapshot } from './snapshot.js';

const variable = (key: string): StoredNode => ({ type: 'variable', attrs: { key } });
const text = (value: string): StoredNode => ({ type: 'text', text: value });

const template: TemplateFile = {
  ...BASE_TEMPLATE,
  header: { content: [{ type: 'paragraph', content: [variable('document.name')] }] },
  footer: {
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
};

// A view of one page with a header and footer, inside an editor root with the given hooks.
function snapshotView(rootData: Record<string, string>) {
  const stored = { formatVersion: 1, sections: [{ name: null, content: [] }] } as const;
  const doc = setPageRegions(
    new Transform(readDocumentFile(stored, documentSchema).doc),
    template,
  ).doc;
  const root = document.createElement('div');
  root.className = 'de-document-editor';
  for (const [name, value] of Object.entries(rootData)) root.setAttribute(`data-${name}`, value);
  const plugin = createPageVariables({
    value: (key) => (key === 'document.name' ? 'Interface notes' : undefined),
    locale: 'en-US',
    now: () => new Date(2026, 10, 11),
  });
  return new EditorView(root, { state: EditorState.create({ doc, plugins: [plugin] }) });
}

// A sectioned document: a portrait body, a landscape appendix, more body and a letter section,
// inside an editor root with the given hooks.
function sectionedView(rootData: Record<string, string> = {}) {
  const sectioned: TemplateFile = {
    ...BASE_TEMPLATE,
    sections: [
      { name: 'appendix', label: 'Appendix', page: { size: 'A4', orientation: 'landscape' } },
      { name: 'letter', label: 'Letter', page: { size: 'US Letter' } },
    ],
  };
  const paragraph = (value: string): StoredNode => ({ type: 'paragraph', content: [text(value)] });
  const stored = {
    formatVersion: 1,
    sections: [
      { name: null, content: [paragraph('Body')] },
      { name: 'appendix', content: [paragraph('Appendix')] },
      { name: null, content: [paragraph('More body')] },
      { name: 'letter', content: [paragraph('Letter')] },
    ],
  } as const;
  const doc = readDocumentFile(stored, documentSchema).doc;
  const root = document.createElement('div');
  root.className = 'de-document-editor';
  for (const [name, value] of Object.entries(rootData)) root.setAttribute(`data-${name}`, value);
  const view = new EditorView(root, { state: EditorState.create({ doc }) });
  return { view, template: sectioned };
}

// The snapshot's body, adopted into the test's document so its elements are this window's.
function parse(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return {
    body: document.importNode(parsed.body, true),
    style: parsed.head.querySelector('style')?.textContent ?? '',
  };
}

describe('documentSnapshot', () => {
  it('DOCE-EDITOR-6.9 keeps the page numbers, totals, dates and host values of every region', () => {
    const view = snapshotView({ layout: 'page' });
    const snapshot = parse(documentSnapshot(view, { template }));
    expect(snapshot.body.querySelector('.pm-page-header')?.textContent).toBe('Interface notes');
    expect(snapshot.body.querySelector('.pm-page-footer')?.textContent).toBe(
      'Page 1 of 1, November 11, 2026',
    );
    expect(snapshot.body.querySelector('[contenteditable]')).toBeNull();
    view.destroy();
  });

  it('DOCE-EDITOR-6.9 wraps the pages in the editor root hooks, read only', () => {
    const view = snapshotView({ layout: 'page', mode: 'authoring', markup: 'all' });
    const snapshot = parse(documentSnapshot(view, { template }));
    const root = snapshot.body.firstElementChild;
    expect(root).toHaveClass('de-document-editor');
    expect(root).toHaveAttribute('data-layout', 'page');
    expect(root).toHaveAttribute('data-markup', 'all');
    expect(root).toHaveAttribute('data-mode', 'reading');
    expect(root?.querySelector('.pm-page')).not.toBeNull();
    view.destroy();
  });

  it('DOCE-EDITOR-6.14 prints each section on its template section sheet size', () => {
    const { view, template: sectioned } = sectionedView();
    const snapshot = parse(documentSnapshot(view, { template: sectioned }));
    const sheets = [...snapshot.body.querySelectorAll('.pm-section')].map((section) =>
      section.getAttribute('data-print-sheet'),
    );
    expect(sheets).toEqual(['0', '1', '0', '2']);
    const { width, height } = templatePageMetrics(sectioned);
    const portrait = `${String(width)}px ${String(height)}px`;
    expect(snapshot.style).toContain(`@page { size: ${portrait}; margin: 0; }`);
    expect(snapshot.style).toContain(`@page de-sheet-0 { size: ${portrait}; margin: 0; }`);
    expect(snapshot.style).toContain(
      `@page de-sheet-1 { size: ${String(height)}px ${String(width)}px; margin: 0; }`,
    );
    expect(snapshot.style).toContain('@page de-sheet-2 { size: 816px 1056px; margin: 0; }');
    expect(snapshot.style).toContain('.pm-section[data-print-sheet="1"] { page: de-sheet-1; }');
    view.destroy();
  });

  it('DOCE-EDITOR-6.15 leaves out view-only decorations and the root view state', () => {
    const { view, template: sectioned } = sectionedView({
      layout: 'page',
      debug: 'true',
      'layout-state': 'settled',
    });
    const doc = view.state.doc;
    const decorated = new Plugin({
      props: {
        decorations: (state) =>
          DecorationSet.create(state.doc, [
            viewOnlyInline(
              { from: 0, to: doc.content.size },
              { class: 'flash', 'data-flash': 'on' },
            ),
            Decoration.inline(0, doc.content.size, { 'data-kept': 'on' }),
          ]),
      },
    });
    view.updateState(
      view.state.reconfigure({ plugins: [...view.state.plugins, createSearch(), decorated] }),
    );
    setSearch('body')(view.state, view.dispatch);
    expect(view.dom.querySelectorAll('[data-search-match][data-flash]')).toHaveLength(2);
    const snapshot = parse(documentSnapshot(view, { template: sectioned }));
    for (const hook of ['data-search-match', 'data-flash', 'data-de-view-only']) {
      expect(snapshot.body.querySelector(`[${hook}]`)).toBeNull();
    }
    expect(snapshot.body.querySelector('.flash')).toBeNull();
    expect(snapshot.body.querySelector('p')?.innerHTML).toBe('<span data-kept="on">Body</span>');
    const root = snapshot.body.firstElementChild;
    expect(root).toHaveAttribute('data-layout', 'page');
    expect(root).not.toHaveAttribute('data-debug');
    expect(root).not.toHaveAttribute('data-layout-state');
    view.destroy();
  });

  // The sectioned view with "Body" suggested for insertion and "More" for deletion.
  function suggestedView(rootData: Record<string, string> = {}) {
    const sectioned = sectionedView(rootData);
    const { view } = sectioned;
    const ranges: Record<string, [number, number]> = {};
    view.state.doc.descendants((node, pos) => {
      if (node.isText && node.text) ranges[node.text] = [pos, pos + node.text.length];
    });
    const [bodyFrom = 0, bodyTo = 0] = ranges.Body ?? [];
    const [moreFrom = 0] = ranges['More body'] ?? [];
    const { insertion, deletion } = documentSchema.marks;
    if (!insertion || !deletion) throw new Error('The schema has no suggestion marks.');
    const tr = view.state.tr
      .addMark(bodyFrom, bodyTo, insertion.create({ dataId: 's1' }))
      .addMark(moreFrom, moreFrom + 'More '.length, deletion.create({ dataId: 's2' }));
    view.dispatch(tr);
    return sectioned;
  }

  const texts = (body: Element) =>
    [...body.querySelectorAll('p')].map((paragraph) => paragraph.textContent);

  it('DOCE-EDITOR-6.16 prints suggestions with all their markup, as if accepted or as if rejected', () => {
    const { view, template: sectioned } = suggestedView({ markup: 'all' });
    const all = parse(documentSnapshot(view, { template: sectioned }));
    expect(all.body.firstElementChild).toHaveAttribute('data-markup', 'all');
    expect(all.body.querySelector('ins[data-id="s1"]')).toHaveTextContent('Body');
    expect(all.body.querySelector('del[data-id="s2"]')).toHaveTextContent('More');

    const final = parse(documentSnapshot(view, { template: sectioned, markup: 'final' }));
    expect(final.body.firstElementChild).toHaveAttribute('data-markup', 'final');
    expect(final.body.querySelector('ins, del')).toBeNull();
    expect(texts(final.body)).toEqual(['Body', 'Appendix', 'body', 'Letter']);

    const original = parse(documentSnapshot(view, { template: sectioned, markup: 'original' }));
    expect(original.body.querySelector('ins, del')).toBeNull();
    expect(texts(original.body)).toEqual(['', 'Appendix', 'More body', 'Letter']);
    view.destroy();
  });

  it('DOCE-EDITOR-6.16 takes the editor markup by default, its simple markup as if accepted', () => {
    const { view, template: sectioned } = suggestedView({ markup: 'simple' });
    const snapshot = parse(documentSnapshot(view, { template: sectioned }));
    expect(snapshot.body.firstElementChild).toHaveAttribute('data-markup', 'final');
    expect(texts(snapshot.body)).toEqual(['Body', 'Appendix', 'body', 'Letter']);
    view.destroy();
  });

  it('DOCE-EDITOR-6.15 DOCE-EDITOR-6.17 keeps content widgets and leaves out view-only ones', () => {
    const { view, template: sectioned } = sectionedView();
    const widget = (className: string) => () => {
      const element = document.createElement('span');
      element.className = className;
      element.textContent = className;
      return element;
    };
    const widgets = new Plugin({
      props: {
        decorations: (state) =>
          DecorationSet.create(state.doc, [
            Decoration.widget(3, widget('lost-words')),
            viewOnlyWidget(3, widget('hint')),
          ]),
      },
    });
    view.updateState(view.state.reconfigure({ plugins: [widgets] }));
    expect(view.dom.querySelector('.hint')).not.toBeNull();
    const snapshot = parse(documentSnapshot(view, { template: sectioned }));
    expect(snapshot.body.querySelector('.lost-words')).toHaveTextContent('lost-words');
    expect(snapshot.body.querySelector('.hint')).toBeNull();
    view.destroy();
  });

  it('DOCE-EDITOR-6.18 marks the snapshot as print, in the light scheme, with no sheet after the last page', () => {
    const { view, template: sectioned } = sectionedView({ print: 'false' });
    const snapshot = parse(documentSnapshot(view, { template: sectioned }));
    expect(snapshot.body.firstElementChild).toHaveAttribute('data-print', 'true');
    expect(snapshot.style).toContain(':root { color-scheme: light; }');
    expect(snapshot.style).toContain('print-color-adjust: exact');
    expect(snapshot.style).toContain(
      '.pm-section:last-child > .pm-page:last-child { break-after: auto; }',
    );
    view.destroy();
  });
});
