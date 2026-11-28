import { EditorState } from 'prosemirror-state';
import { Transform } from 'prosemirror-transform';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../../test/canvas-fixtures.js';
import { documentSchema } from '../../test/document-markup.js';
import { footnoteState, note, paragraph as stored } from '../../test/footnote-fixtures.js';
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
import type { PagesTextEngine, RegionRoom } from './text-engine-types.js';

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

// A state of a document of one-line paragraphs, with the template's header and footer showing
// their variables, and the room each page laid out in it gave its regions.
function layOut(
  template: TemplateFile,
  paragraphs: number,
  pageHeight: number,
  more: Partial<DocumentLayoutOptions> & { regionRoom?: RegionRoomBy } = {},
): PageMetric[] {
  const content = Array.from({ length: paragraphs }, (_, index) => line(text(`Line ${index}`)));
  const { doc } = readDocumentFile({ formatVersion: 1, sections: [{ content }] }, documentSchema);
  const state = EditorState.create({
    doc: setPageRegions(new Transform(doc), template).doc,
    plugins: [createPageVariables()],
  });
  const real = createPagesTextEngine({
    template,
  });
  const { regionRoom, ...options } = more;
  const engine: PagesTextEngine = regionRoom
    ? { ...real, measureRegion: (node, scope, texts) => regionRoom(texts) }
    : real;
  const pages: PageMetric[] = [];
  const layout = { ...options, pageHeight, engine, onPage: (page: PageMetric) => pages.push(page) };
  layoutDocument(state, layout);
  layoutDocument(state, { ...layout, onPage: undefined });
  real.destroy();
  return pages;
}

// A region's room by the texts its variables show, standing in for the engine's.
type RegionRoomBy = (texts: ReadonlyMap<string, string> | undefined) => RegionRoom;

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

  it.each(['header', 'footer'] as const)(
    'DOCE-PAGINATION-5.5 lays the body blocks out again when the %s grows or shrinks',
    (region) => {
      const template = templateWith({ [region]: [line(text('Report'))] });
      const content = ['one', 'two', 'three'].map((value) => line(text(value)));
      const { doc } = readDocumentFile(
        { formatVersion: 1, sections: [{ content }] },
        documentSchema,
      );
      const state = EditorState.create({ doc: setPageRegions(new Transform(doc), template).doc });
      const real = createPagesTextEngine({ template });
      let height = 10;
      const engine: PagesTextEngine = {
        ...real,
        measureRegion: (node) => ({
          height: node.type.name === `page_${region}` ? height : 0,
          gap: 0,
          children: [],
        }),
      };
      const memory = createLayoutMemory();
      const layout = (incremental: boolean) => {
        const pages: PageMetric[] = [];
        layoutDocument(state, {
          pageHeight: 80,
          rules: {},
          engine,
          memory: incremental ? memory : undefined,
          onPage: (page) => pages.push(page),
        });
        return pages;
      };
      // Two of the paragraphs fit on a page beside a 10px region, one beside a 35px region.
      expect(layout(true)).toHaveLength(2);
      height = 35;
      const grown = layout(true);
      expect(grown).toHaveLength(3);
      expect(grown).toEqual(layout(false));
      expect(grown.every(({ used, available }) => used <= available)).toBe(true);
      height = 10;
      const shrunk = layout(true);
      expect(shrunk).toHaveLength(2);
      expect(shrunk).toEqual(layout(false));
      real.destroy();
    },
  );

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
    expect(memory.pages).toEqual([first?.pages]);
  });

  it('DOCE-PAGINATION-11.10 leaves room for both counts when the page count flips between two', () => {
    // A footer whose count takes two lines at 9 pages and one at 10, as a font whose `10` is
    // narrower than its `9` can: 9 pages' tall footers make 10 pages, 10 pages' short ones 9.
    const regionRoom: RegionRoomBy = (texts) => {
      const total = texts?.get('page.total');
      const height = total === '9' ? 2 * LINE : LINE;
      return { height, gap: 0, children: [] };
    };
    const template = templateWith({ footer: [line(variable('page.total'))] });
    const memory = createLayoutMemory();
    const pages = layOut(template, 76, 280, { regionRoom, memory });
    expect(memory.pages).toEqual([9, 10]);
    // Every page takes the taller room, so the count drawn, whichever it is, fits its footer.
    for (const page of pages) expect(page.footer).toBe(2 * LINE);
    expect(pages.length).toBe(10);
  });
});

describe('footnote room of a split paragraph', () => {
  beforeEach(() => {
    installFakeCanvas();
  });

  const words = (word: string, count: number) =>
    Array.from({ length: count }, () => word).join(' ');

  // The pages of one section, laid out with the real engine under the fake Canvas.
  function pagesOf(
    content: StoredNode[],
    footnoteNumbering: 'document' | 'page' = 'document',
  ): PageMetric[] {
    const state = footnoteState(content);
    const paged = EditorState.create({
      doc: setPageRegions(new Transform(state.doc), BASE_TEMPLATE).doc,
      plugins: state.plugins,
    });
    const engine = createPagesTextEngine({ template: BASE_TEMPLATE });
    const pages: PageMetric[] = [];
    layoutDocument(paged, {
      pageHeight: 300,
      engine,
      footnoteNumbering,
      onPage: (page) => pages.push(page),
    });
    engine.destroy();
    return pages;
  }
  const fill = (pages: readonly PageMetric[]) =>
    pages.map(({ used, footnotes }) => ({ used: Math.round(used), notes: footnotes > 0 }));

  it.each(['document', 'page'] as const)(
    'DOCE-PAGINATION-7.2 leaves the room of a footnote cited at a paragraph’s end only on its page, numbered by %s',
    (numbering) => {
      const plain = fill(pagesOf([stored(text(words('word', 400)))], numbering));
      const noted = fill(
        pagesOf([stored(text(words('word', 400)), note('a', words('note', 200)))], numbering),
      );
      expect(plain).toHaveLength(2);
      // The first page takes as much of the paragraph as it does without the footnote.
      expect(noted[0]).toEqual(plain[0]);
      expect(noted.at(-1)?.notes).toBe(true);
      expect(noted.slice(0, -1).every((page) => !page.notes)).toBe(true);
    },
  );

  it.each(['document', 'page'] as const)(
    'DOCE-PAGINATION-7.2 leaves the room on the page that holds a mid-paragraph marker, numbered by %s',
    (numbering) => {
      const plain = fill(
        pagesOf([stored(text(words('word', 600)), text(words('more', 600)))], numbering),
      );
      const noted = fill(
        pagesOf(
          [
            stored(
              text(words('word', 600)),
              note('a', words('note', 40)),
              text(` ${words('more', 600)}`),
            ),
          ],
          numbering,
        ),
      );
      const marked = noted.findIndex((page) => page.notes);
      expect(marked).toBeGreaterThan(0);
      // The pages before the marker's give up no room for it.
      expect(noted.slice(0, marked)).toEqual(plain.slice(0, marked));
      expect(noted.filter((page) => page.notes)).toHaveLength(1);
    },
  );
});
