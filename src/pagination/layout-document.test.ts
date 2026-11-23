import { EditorState } from 'prosemirror-state';
import { Transform } from 'prosemirror-transform';
import { EditorView } from 'prosemirror-view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../../test/canvas-fixtures.js';
import { documentSchema } from '../../test/document-markup.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  readDocumentFile,
  resolveTemplateFile,
  setPageRegions,
  type StoredNode,
  type TemplateFile,
} from '../model/index.js';
import {
  createLayoutMemory,
  type DocumentLayoutOptions,
  layoutDocument,
  type PageMetric,
  type SectionReport,
} from './layout-document.js';
import { createPageVariables } from './page-variables.js';
import { createPagesTextEngine } from './text-engine.js';

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const variable = (key: string): StoredNode => ({ type: 'variable', attrs: { key } });
const line = (...content: StoredNode[]): StoredNode => ({ type: 'paragraph', content });

// Under the fake Canvas, a header of `Report`, 92 letters and the page's number takes one line on
// page 9 and two from page 10; with 91 letters, one on page 99 and two from page 100.
const report = (letters: number) => text(`Report ${'A'.repeat(letters)} `);

function templateWith(regions: { header?: StoredNode[]; footer?: StoredNode[] }): TemplateFile {
  return resolveTemplateFile(
    {
      formatVersion: 1,
      id: 'numbered-regions',
      ...(regions.header ? { header: { content: regions.header } } : {}),
      ...(regions.footer ? { footer: { content: regions.footer } } : {}),
    },
    {
      loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
      baseTemplateId: BASE_TEMPLATE_ID,
    },
  );
}

// A view of a document of one-line paragraphs, with the template's header and footer showing
// their variables, and the room each page laid out in it gave its regions.
function layOut(
  template: TemplateFile,
  paragraphs: number,
  pageHeight: number,
  more: Partial<DocumentLayoutOptions> = {},
): PageMetric[] {
  const content = Array.from({ length: paragraphs }, (_, index) => line(text(`Line ${index}`)));
  const { doc } = readDocumentFile({ formatVersion: 1, sections: [{ content }] }, documentSchema);
  const state = EditorState.create({
    doc: setPageRegions(new Transform(doc), template).doc,
    plugins: [createPageVariables()],
  });
  const view = new EditorView(document.createElement('div'), { state });
  const engine = createPagesTextEngine({
    template,
    measureIn: document.createElement('div'),
    onAtomsSettled: () => undefined,
  });
  const pages: PageMetric[] = [];
  const layout = { ...more, pageHeight, engine, onPage: (page: PageMetric) => pages.push(page) };
  layoutDocument(view, layout);
  layoutDocument(view, { ...layout, onPage: undefined });
  engine.destroy();
  view.destroy();
  return pages;
}

// One line paragraph and its spacing, as the engine lays it out under the fake Canvas.
const LINE = 26;

describe('headers and footers showing page numbers', () => {
  beforeEach(() => {
    installFakeCanvas();
    // The test DOM lays nothing out: every region the view draws has some height.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 100, 1),
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('DOCE-PAGINATION-11.10 gives each page the header room its own number takes, 9 to 10', () => {
    const template = templateWith({ header: [line(report(92), variable('page.current'))] });
    const pages = layOut(template, 12 * 4, 4 * LINE + 36);
    expect(pages.length).toBeGreaterThanOrEqual(10);
    const rooms = pages.map((page) => page.header);
    expect(rooms[8]).toBeLessThan(rooms[9] ?? 0);
    expect(new Set(rooms.slice(0, 9)).size).toBe(1);
    expect(new Set(rooms.slice(9)).size).toBe(1);
    for (const page of pages) {
      expect(page.used).toBeLessThanOrEqual(page.available);
      expect(page.available + page.header + page.footer).toBe(4 * LINE + 36);
    }
  });

  it('DOCE-PAGINATION-11.10 gives each page the footer room its own number takes, 99 to 100', () => {
    const template = templateWith({ footer: [line(report(91), variable('page.current'))] });
    const pages = layOut(template, 102, LINE + 36);
    expect(pages.length).toBeGreaterThanOrEqual(100);
    const rooms = pages.map((page) => page.footer);
    expect(rooms[98]).toBeLessThan(rooms[99] ?? 0);
    expect(new Set(rooms.slice(0, 99)).size).toBe(1);
    for (const page of pages) expect(page.used).toBeLessThanOrEqual(page.available);
  });

  it('DOCE-PAGINATION-11.10 lays the pages out again with the page count they come to', () => {
    // The count's width decides the room: 9 pages leave the footer one line, 10 give it two, and
    // the pages that a two-line footer leaves come to at least 10.
    const template = templateWith({ footer: [line(report(92), variable('page.total'))] });
    const pages = layOut(template, 9 * 2 + 1, 2 * LINE + 36);
    expect(pages.length).toBeGreaterThanOrEqual(10);
    const rooms = new Set(pages.map((page) => page.footer));
    expect(rooms.size).toBe(1);
    const [room] = rooms;
    const single = layOut(templateWith({ footer: [line(report(92), text('1'))] }), 1, 400);
    expect(room).toBeGreaterThan(single[0]?.footer ?? Infinity);
  });

  it('DOCE-PAGINATION-11.10 reuses every page of a layout that settled on its page count', () => {
    const template = templateWith({ footer: [line(report(92), variable('page.total'))] });
    const memory = createLayoutMemory();
    const sections: SectionReport[] = [];
    layOut(template, 9 * 2 + 1, 2 * LINE + 36, {
      memory,
      onSection: (section) => sections.push(section),
    });
    const [first, again] = sections;
    expect(first?.pagesLaidOut).toBeGreaterThan(0);
    expect(again).toMatchObject({ pagesLaidOut: 0, pages: first?.pages });
    expect(memory.pages).toBe(first?.pages);
  });
});
