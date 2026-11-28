import { EditorState } from 'prosemirror-state';
import { Transform } from 'prosemirror-transform';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../../test/canvas-fixtures.js';
import { documentSchema, parseMarkup } from '../../test/document-markup.js';
import { footnoteState, note, paragraph as stored } from '../../test/footnote-fixtures.js';
import type { SuggestionMarkup } from '../layout-engine/hidden-suggestions.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  projectDocument,
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

describe('footnote room', () => {
  it('DOCE-PAGINATION-7.2 reserves footnote room only on the page of each paragraph fragment', () => {
    installFakeCanvas();
    const doc = parseMarkup(
      '<div class="pm-section" data-pm-section="true">' +
        '<p>abc<sup data-footnote-id="a"></sup>def<sup data-footnote-id="b"></sup></p>' +
        '<div class="pm-page-footnotes" data-pm-page-footnotes="true">' +
        '<p class="pm-footnote-entry" data-footnote-id="a">First</p>' +
        '<p class="pm-footnote-entry" data-footnote-id="b">Second</p></div></div>',
    );
    const state = EditorState.create({ doc });
    const real = createPagesTextEngine({ template: BASE_TEMPLATE });
    const engine: PagesTextEngine = {
      ...real,
      measureBlock: (node) => ({
        node,
        height: 80,
        marginTop: 0,
        marginBottom: 0,
        measurement: {
          offset: 0,
          lines: { lines: Array.from({ length: 8 }, (_, from) => ({ from, height: 10 })) },
          measure: () => ({ height: 80, lines: 8 }),
        },
      }),
      // The page content's blocks are measured as each block is.
      measureContent(content, scope, inserted) {
        return content.children.map((node) => this.measureBlock(node, scope, inserted));
      },
      measureRegion: (node) =>
        node.type.name === 'page_footnotes'
          ? {
              height: 36,
              gap: 0,
              children: [
                { top: 0, bottom: 18 },
                { top: 18, bottom: 36 },
              ],
            }
          : null,
    };
    const metrics: PageMetric[] = [];
    const [pages] = layoutDocument(state, {
      engine,
      pageHeight: 52,
      onPage: (page) => metrics.push(page),
    });

    expect(pages).toHaveLength(3);
    expect(metrics.map(({ used, footnotes }) => [used, footnotes])).toEqual([
      [30, 0],
      [30, 18],
      [20, 18],
    ]);
    real.destroy();
  });
});

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
          pageHeight: 78,
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

  it('DOCE-PAGINATION-11.10 counts a sheet with no body blocks when measuring every header', () => {
    const template = templateWith({
      header: [line(variable('page.current'), text(' of '), variable('page.total'))],
    });
    const { doc } = readDocumentFile(
      {
        formatVersion: 1,
        sections: [{ content: [line(text('Removed'))] }, { content: [line(text('Body'))] }],
      },
      documentSchema,
    );
    const emptied = new Transform(doc);
    doc.descendants((node, pos) => {
      if (node.type.name !== 'paragraph' || node.textContent !== 'Removed') return true;
      emptied.delete(pos, pos + node.nodeSize);
      return false;
    });
    const state = EditorState.create({
      doc: setPageRegions(emptied, template).doc,
      plugins: [createPageVariables()],
    });
    const real = createPagesTextEngine({ template });
    const engine: PagesTextEngine = {
      ...real,
      measureRegion: (node, scope, texts) =>
        node.type.name === 'page_header'
          ? {
              height: 10 * Number(texts?.get('page.current')) + Number(texts?.get('page.total')),
              gap: 0,
              children: [],
            }
          : real.measureRegion(node, scope, texts),
    };
    const memory = createLayoutMemory();
    const headers: number[] = [];
    const sections: SectionReport[] = [];
    const layout = () =>
      layoutDocument(state, {
        pageHeight: 100,
        engine,
        memory,
        onPage: (page) => headers.push(page.header),
        onSection: (section) => sections.push(section),
      });

    expect(
      layout().map((pages) => pages.map((page) => page.map((node) => node.textContent))),
    ).toEqual([[[]], [['Body']]]);
    expect(headers).toEqual([12, 22]);
    layout();
    expect(headers).toEqual([12, 22, 12, 22]);
    expect(sections.slice(2).map(({ pages, pagesLaidOut }) => [pages, pagesLaidOut])).toEqual([
      [1, 0],
      [1, 0],
    ]);
    real.destroy();
  });

  it('DOCE-PAGINATION-11.10 gives each page the footer room its own number takes, 99 to 100', () => {
    const template = templateWith({ footer: [line(report(91), variable('page.current'))] });
    const pages = layOut(template, 102, LINE + 34);
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
    const pages = layOut(template, 9 * 2 + 1, 2 * LINE + 34);
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

  it('DOCE-PAGINATION-11.10 says why when the page count still moves after its last pass', () => {
    // A footer taller the more pages there are: each count lays out more pages than the one before.
    const regionRoom: RegionRoomBy = (texts) => {
      const total = Number(texts?.get('page.total') ?? 0);
      return { height: Math.min(total * 6, 200), gap: 0, children: [] };
    };
    const template = templateWith({ footer: [line(variable('page.total'))] });
    const reasons: string[] = [];
    layOut(template, 76, 276, { regionRoom, onUnsettled: (reason) => reasons.push(reason) });
    expect(reasons).toEqual([
      'the page count moved after 3 passes',
      'the page count moved after 3 passes',
    ]);
  });
});

describe('region rooms across passes', () => {
  beforeEach(() => {
    installFakeCanvas();
  });

  it('DOCE-PAGINATION-11.10 lays a "page X of Y" footer out once for each page and count', () => {
    const template = templateWith({
      footer: [line(text('Page '), variable('page.current'), text(' of '), variable('page.total'))],
    });
    let calls = 0;
    const pages = layOut(template, 30 * 4, 4 * LINE + 36, {
      regionRoom: () => {
        calls += 1;
        return { height: LINE, gap: 0, children: [] };
      },
    });
    expect(pages.length).toBe(40);
    // Two layouts of 40 pages, each footer laid out once for each page and page count a layout
    // tries, however often its passes read it: 246 times when every read laid it out again.
    expect(calls).toBe(166);
  });
});

describe('blocks the engine cannot lay out', () => {
  beforeEach(() => {
    installFakeCanvas();
  });

  it('DOCE-PAGINATION-11.1 lays out again only the page an edit reaches, between two blocks the engine refuses', () => {
    // A host draws quotes with a node view of its own and no rule sizes them: the engine refuses
    // them, and they take no room.
    const quote: StoredNode = { type: 'blockquote', content: [line(text('Quoted'))] };
    const lines = Array.from({ length: 60 }, (_, index) => line(text(`Line ${String(index)}`)));
    const content = [quote, ...lines, quote];
    const { doc } = readDocumentFile({ formatVersion: 1, sections: [{ content }] }, documentSchema);
    const engine = createPagesTextEngine({ template: BASE_TEMPLATE, hostViews: ['blockquote'] });
    const memory = createLayoutMemory();
    const layout = (state: EditorState) => {
      const sections: SectionReport[] = [];
      layoutDocument(state, {
        pageHeight: 4 * LINE,
        engine,
        memory,
        onSection: (section) => sections.push(section),
      });
      return sections[0];
    };
    const state = EditorState.create({ doc });
    const first = layout(state);
    expect(first?.pages).toBeGreaterThan(10);
    const before = engine.stats().refused;
    expect(before).toBe(2);
    // Typing on a page near the end: the refused quotes are the blocks they were.
    let at = -1;
    doc.descendants((node, pos) => {
      if (node.isText && node.text === 'Line 50') at = pos + node.nodeSize;
      return at < 0;
    });
    const edited = layout(state.apply(state.tr.insertText(', typed', at)));
    expect(edited?.pages).toBe(first?.pages);
    expect(edited?.pagesLaidOut).toBeLessThanOrEqual(2);
    expect(engine.stats().refused).toBe(before);
    engine.destroy();
  });
});

// A small seeded generator, so a failing case can be run again.
function random(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

describe('pages after an edit that adds a page', () => {
  beforeEach(() => {
    installFakeCanvas();
  });

  it('DOCE-PAGINATION-5.5 reuses the later pages once one starts where an old page did, whatever its index', () => {
    const lengths = random(5);
    const words = (count: number) => Array.from({ length: count }, () => 'word').join(' ');
    // A page break after every fortieth paragraph, where the pages after an edit start again
    // where they did.
    const content = Array.from({ length: 400 }, (_, index): StoredNode[] => [
      line(text(words(10 + Math.floor(lengths() * 80)))),
      ...(index % 40 === 39 ? [{ type: 'pageBreak' }] : []),
    ]).flat();
    const { doc } = readDocumentFile({ formatVersion: 1, sections: [{ content }] }, documentSchema);
    const engine = createPagesTextEngine({ template: BASE_TEMPLATE });
    const memory = createLayoutMemory();
    const layout = (state: EditorState) => {
      const sections: SectionReport[] = [];
      layoutDocument(state, {
        pageHeight: 12 * LINE,
        engine,
        memory,
        onSection: (section) => sections.push(section),
      });
      return sections[0];
    };
    const state = EditorState.create({ doc });
    const first = layout(state);
    let at = -1;
    let seen = 0;
    doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && (seen += 1) === 10) at = pos + node.nodeSize - 1;
      return at < 0;
    });
    // A page's worth of words more in the tenth paragraph: the pages up to the next page break are
    // laid out again, and none after it.
    const edited = layout(state.apply(state.tr.insertText(` ${words(600)}`, at)));
    expect(edited?.pages).toBeGreaterThan(first?.pages ?? 0);
    expect(edited?.pagesLaidOut).toBeLessThanOrEqual(8);
    engine.destroy();
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

describe('code longer than a page', () => {
  beforeEach(() => {
    installFakeCanvas();
  });

  it('DOCE-PAGINATION-3.3 splits one code line longer than a page across pages that hold it', () => {
    const code = 'x'.repeat(8000);
    const { doc } = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            content: [{ type: 'code_block', content: [text(code)] }, line(text('after'))],
          },
        ],
      },
      documentSchema,
    );
    const state = EditorState.create({
      doc: setPageRegions(new Transform(doc), BASE_TEMPLATE).doc,
    });
    const engine = createPagesTextEngine({ template: BASE_TEMPLATE });
    const pages: PageMetric[] = [];
    const laid = layoutDocument(state, {
      pageHeight: 300,
      engine,
      onPage: (page) => pages.push(page),
    });
    engine.destroy();
    expect(pages.length).toBeGreaterThan(2);
    expect(pages.every(({ used, available }) => used <= available)).toBe(true);
    const parts = (laid[0] ?? []).flat().filter((node) => node.type.name === 'code_figure');
    const codes = parts.map((figure) => figure.lastChild);
    expect(codes.map((each) => each?.textContent).join('')).toBe(code);
    expect(codes.slice(1).every((each) => each?.attrs.codeLineContinued === true)).toBe(true);
    expect(codes.every((each) => each?.attrs.codeLineStart === 1)).toBe(true);
  });
});

describe('footnotes a markup hides', () => {
  beforeEach(() => {
    installFakeCanvas();
  });

  const inserted = (node: StoredNode): StoredNode => ({
    ...node,
    marks: [{ type: 'insertion', attrs: { id: 's0000001', author: 'other' } }],
  });

  // The footnote room of each page, laid out in a markup, and the entries the pages hold.
  function footnotesIn(markup: SuggestionMarkup) {
    const state = footnoteState([stored(text('Cited '), inserted(note('a', 'A suggested note.')))]);
    const paged = EditorState.create({
      doc: setPageRegions(new Transform(state.doc), BASE_TEMPLATE).doc,
      plugins: state.plugins,
    });
    const engine = createPagesTextEngine({ template: BASE_TEMPLATE, markup: () => markup });
    const pages: PageMetric[] = [];
    const sections = layoutDocument(paged, {
      pageHeight: 300,
      engine,
      onPage: (page) => pages.push(page),
    });
    const hidden = engine.hiddenSuggestion?.() ?? null;
    const projected = projectDocument(paged.doc, sections, { hidden });
    const entries: string[] = [];
    projected.descendants((node) => {
      if (node.type.name === 'footnote_entry') entries.push(String(node.attrs.footnoteId));
      return true;
    });
    engine.destroy();
    return { room: pages.map((page) => page.footnotes > 0), entries };
  }

  it('DOCE-PAGINATION-11.12 leaves no room and no entry for a footnote cited only in a suggestion the markup hides', () => {
    expect(footnotesIn('all')).toEqual({ room: [true], entries: ['a'] });
    expect(footnotesIn('final')).toEqual({ room: [true], entries: ['a'] });
    expect(footnotesIn('original')).toEqual({ room: [false], entries: [] });
  });
});
