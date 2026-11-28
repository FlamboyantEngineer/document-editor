import type { Node } from 'prosemirror-model';
import { EditorState, Plugin, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../../test/canvas-fixtures.js';
import { documentSchema } from '../../test/document-markup.js';
import { STUB_INPUTS } from '../../test/pages-fixtures.js';
import { linkedCodeFigure } from '../layout-engine/blocks/linked-code.js';
import type { ContentsDrawn } from '../layout-engine/blocks/types.js';
import type { TextLine } from '../layout-engine/line-table.js';
import { BASE_TEMPLATE } from '../model/templates/base-template.js';
import { forcedLines, forcedLinesKey } from './forced-lines.js';
import { insertedTexts } from './inserted-texts.js';
import { paginationKey } from './layout-marks.js';
import { objectBoxAt } from './object-boxes.js';
import { createPagesTextEngine } from './text-engine.js';
import type { DrawnLines, PagesTextEngine } from './text-engine-types.js';
import { pageTextLines } from './text-lines.js';

const create = (name: string, attrs: Record<string, unknown> | null, content?: Node[]) => {
  const type = documentSchema.nodes[name];
  if (!type) throw new Error(name);
  return type.create(attrs, content);
};

const paragraph = (text: string, attrs: Record<string, unknown> = {}) =>
  create('paragraph', attrs, text ? [documentSchema.text(text)] : []);

const page = (blocks: Node[]) =>
  create('page', null, [
    create('page_header', null),
    create('page_content', null, blocks),
    create('page_footnotes', null, []),
    create('page_footer', null),
  ]);

const pagesDoc = (pages: Node[][]) =>
  create('doc', null, [create('page_section', { sectionName: 'Body' }, pages.map(page))]);

interface StubOptions {
  /** Characters on a line. */
  readonly perLine?: number;
  readonly left?: number;
  readonly justify?: boolean;
  readonly headings?: ReadonlyMap<number, string>;
  readonly paragraphs?: ReadonlySet<number>;
}

// An engine that breaks a block's text every `perLine` characters, each line 10px wide in 100px.
function stubEngine(options: StubOptions = {}) {
  const calls: { text: string; scope: string | null; prefix: string | undefined }[] = [];
  const perLine = options.perLine ?? 10;
  const engine: PagesTextEngine = {
    template: {} as PagesTextEngine['template'],
    inputs: () => STUB_INPUTS,
    number: () => undefined,
    numbering: () => ({
      headings: options.headings ?? new Map(),
      paragraphs: options.paragraphs ?? new Set(),
    }),
    measureBlock: (node) => ({ node, height: 20, marginTop: 0, marginBottom: 0 }),
    measureContent: (content) =>
      content.children.map((node) => ({ node, height: 20, marginTop: 0, marginBottom: 0 })),
    pageDigits: () => 3,
    contentsDrawn: () => null,
    measureRegion: () => null,
    insertedReserved: () => [],
    regionLines: () => new Map(),
    objectBoxes: () => new Map(),
    nestedLines(container, scope) {
      const found = new Map<Node, DrawnLines>();
      container.descendants((child) => {
        // Linked code is laid out as the code block of its figure, as its layout records it.
        const linked = linkedCodeFigure(child)?.code;
        if (linked) {
          const table = this.lines(linked, { scope });
          if (table) found.set(linked, table);
          return false;
        }
        if (!child.isTextblock) return true;
        const table = this.lines(child, { scope });
        if (table) found.set(child, table);
        return false;
      });
      return found;
    },
    lines(node, place) {
      calls.push({ text: node.textContent, scope: place.scope, prefix: place.prefix });
      const size = node.content.size;
      const lines: TextLine[] = [];
      for (let from = 0; from < size || lines.length === 0; from += perLine) {
        const to = Math.min(size, from + perLine);
        const end = to < size ? 'wrap' : 'end';
        lines.push({ from, to, width: 10, left: options.left ?? 0, top: 0, height: 20, end });
      }
      const table: DrawnLines = {
        width: 100,
        lines,
        height: lines.length * 20,
        overhead: 0,
        justify: options.justify ?? false,
      };
      return table;
    },
    mathPending: () => null,
    mathOf: () => null,
    stats: () => ({ laid: 0, refused: 0, reasons: new Map() }),
    destroy: () => undefined,
  };
  return { engine, calls };
}

function stateWith(doc: Node, engine: PagesTextEngine | null, version = 0) {
  const source = { engine: () => engine, version: () => version };
  return EditorState.create({ doc, plugins: [forcedLines(source)] });
}

const decorations = (state: EditorState): DecorationSet => {
  const set = forcedLinesKey.getState(state)?.decorations;
  if (!set) throw new Error('no forced lines');
  return set;
};

// The decorations' classes and attributes, with where they are.
function drawn(state: EditorState) {
  return decorations(state)
    .find()
    .map((each: Decoration) => {
      const attrs = (each as unknown as { type: { attrs: Record<string, string> } }).type.attrs;
      const found: Record<string, string | number> = { from: each.from, to: each.to, ...attrs };
      return found;
    });
}

function positionOf(doc: Node, text: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isTextblock && node.textContent === text) found = pos;
    return found < 0;
  });
  return found;
}

const contentsDrawing = (state: EditorState) =>
  decorations(state)
    .find()
    .map((each) => (each.spec as { contentsDrawn?: ContentsDrawn }).contentsDrawn)
    .find((each) => each !== undefined);

function stateWithWords(doc: Node, read: () => { pos: number; side: number }) {
  installFakeCanvas();
  const engine = createPagesTextEngine({ template: BASE_TEMPLATE });
  const forced = forcedLines({ engine: () => engine, version: () => 0 });
  const words = new Plugin({
    props: {
      decorations(state) {
        const { pos, side } = read();
        const widgets = Array.from({ length: 40 }, (_, index) =>
          Decoration.widget(pos, () => document.createElement('del'), {
            insertedText: 'gone ',
            insertedGroup: 'g',
            side: side + 2 * index,
          }),
        );
        return DecorationSet.create(state.doc, widgets);
      },
    },
  });
  const state = EditorState.create({ doc, plugins: [forced, words] });
  const breaks = (on: EditorState) => {
    const set = forced.props.decorations?.call(forced, on);
    return (set instanceof DecorationSet ? set.find() : []).flatMap((each) => {
      const { key, side } = each.spec as { key?: string; side?: number };
      return key?.startsWith('de-forced-lines__break|') ? [{ pos: each.from, side }] : [];
    });
  };
  return { engine, state, breaks };
}

describe('forcedLines', () => {
  it('DOCE-PAGINATION-11.2 marks each top-level paragraph and ends each wrapped line', () => {
    const doc = pagesDoc([[paragraph('aaaaaaaaaabbbbbbbbbbcc', { dataId: 'p1' })]]);
    const state = stateWith(doc, stubEngine().engine);
    const at = positionOf(doc, 'aaaaaaaaaabbbbbbbbbbcc');
    expect(drawn(state)).toEqual([
      { from: at, to: at + 24, class: 'de-forced-lines', 'data-lines': '3', dir: 'ltr' },
      { from: at + 10, to: at + 11, class: 'de-forced-lines__end' },
      { from: at + 20, to: at + 21, class: 'de-forced-lines__end' },
    ]);
  });

  it.each([10, 100])(
    'DOCE-PAGINATION-11.6 keeps numbering through text edits on a %i-page projection',
    (count) => {
      const heading = create('heading', { level: 1 }, [documentSchema.text('Next heading')]);
      const pages = Array.from({ length: count }, (_, page) =>
        Array.from({ length: 10 }, (_, row) => paragraph(`Text ${page}/${row}`)),
      );
      pages[0]?.push(heading);
      const doc = pagesDoc(pages);
      const { engine } = stubEngine();
      let visits = 0;
      vi.spyOn(engine, 'numbering').mockImplementation((numbered) => {
        const headings = new Map<number, string>();
        numbered.descendants((node, pos) => {
          visits += 1;
          if (node.type.name === 'heading') headings.set(pos, '1. ');
        });
        return { headings, paragraphs: new Set() };
      });
      const initial = stateWith(doc, engine);
      const prepared = visits;
      expect(prepared).toBeGreaterThan(count * 10);
      const at = positionOf(doc, 'Text 0/0') + 2;
      const edited = initial.apply(initial.tr.insertText('typed ', at));
      expect(visits).toBe(prepared);
      const prefix = drawn(edited).find(({ 'data-number': number }) => number === '1. ');
      expect(prefix?.from).toBe(positionOf(edited.doc, 'Next heading'));
    },
  );

  it('DOCE-PAGINATION-9.12 draws a block right to left from its text, and a later part as its first', () => {
    const doc = pagesDoc([
      [paragraph('שלום world', { dataId: 'h' }), paragraph('hello مرحبا', { dataId: 'l' })],
      [paragraph('later part', { dataId: 'h', splitPartIndex: 1 })],
    ]);
    const state = stateWith(doc, stubEngine().engine);
    const directions = drawn(state)
      .filter((each) => each.class === 'de-forced-lines')
      .map((each) => each.dir);
    expect(directions).toEqual(['rtl', 'ltr', 'rtl']);
  });

  it('DOCE-PAGINATION-9.12 draws a block, and its later part, in its first strong character’s Bidi_Class', () => {
    const doc = pagesDoc([
      [paragraph('\u2162 שלום', { dataId: 'n' }), paragraph('\u0640abc', { dataId: 't' })],
      [paragraph('שלום again', { dataId: 'n', splitPartIndex: 1 })],
    ]);
    const state = stateWith(doc, stubEngine().engine);
    const directions = drawn(state)
      .filter((each) => each.class === 'de-forced-lines')
      .map((each) => each.dir);
    expect(directions).toEqual(['ltr', 'rtl', 'ltr']);
  });

  it('DOCE-PAGINATION-9.12 keeps a block’s direction from its content, whatever words are deleted in it', () => {
    const doc = pagesDoc([[paragraph('שלום world', { dataId: 'h' })]]);
    const at = positionOf(doc, 'שלום world') + 1;
    // A comparison's deleted Latin words drawn before the Hebrew content (DOCE-PAGINATION-11.11).
    const words = new Plugin({
      props: {
        decorations: (state) =>
          DecorationSet.create(state.doc, [
            Decoration.widget(at, () => document.createElement('del'), {
              insertedText: 'old ',
              insertedGroup: 'g',
              side: -4,
            }),
            Decoration.widget(at, () => document.createElement('del'), {
              insertedText: 'words ',
              insertedGroup: 'g',
              side: -2,
            }),
          ]),
      },
    });
    const source = { engine: () => stubEngine().engine, version: () => 0 };
    const plugin = forcedLines(source);
    const state = EditorState.create({ doc, plugins: [plugin, words] });
    // The decorations the pages draw, laid out with the deleted words.
    const set = plugin.props.decorations?.call(plugin, state);
    const attrs = (set instanceof DecorationSet ? set.find() : []).map(
      (each) => (each as unknown as { type: { attrs?: Record<string, string> } }).type.attrs ?? {},
    );
    expect(
      attrs.filter((each) => each.class === 'de-forced-lines').map((each) => each.dir),
    ).toEqual(['rtl']);
  });

  it('DOCE-PAGINATION-11.11 lays a block out again with its deleted words after an edit in it', () => {
    const doc = pagesDoc([[paragraph('first')]]);
    // A comparison's deleted word drawn at the paragraph's start, wherever an edit moves it.
    const words = new Plugin({
      props: {
        decorations: (state) => {
          const at = positionOf(state.doc, state.doc.textContent) + 1;
          return DecorationSet.create(state.doc, [
            Decoration.widget(at, () => document.createElement('del'), {
              insertedText: 'old ',
              insertedGroup: 'g',
              side: -1,
            }),
          ]);
        },
      },
    });
    const laid: { text: string; words: number }[] = [];
    const base = stubEngine().engine;
    const engine: PagesTextEngine = {
      ...base,
      lines(node, place) {
        laid.push({ text: node.textContent, words: place.inserted?.length ?? 0 });
        return base.lines(node, place);
      },
    };
    const plugin = forcedLines({ engine: () => engine, version: () => 0 });
    const state = EditorState.create({ doc, plugins: [plugin, words] });
    const drawnOf = (on: EditorState) => plugin.props.decorations?.call(plugin, on);
    drawnOf(state);
    const typed = state.apply(state.tr.insertText('x', positionOf(doc, 'first') + 6));
    drawnOf(typed);
    expect(laid.filter((each) => each.text === 'firstx').at(-1)).toEqual({
      text: 'firstx',
      words: 1,
    });
  });

  it("DOCE-PAGINATION-9.12 draws a split paragraph's later part in a list in its first part's direction", () => {
    const item = (text: string, part: number) =>
      create('bullet_list', null, [
        create('list_item', null, [paragraph(text, { dataId: 'p1', splitPartIndex: part })]),
      ]);
    // The first part starts right to left; the later part, on the next page, with Latin text.
    const doc = pagesDoc([[item('שלום עולם', 0)], [item('world again', 1)]]);
    const state = stateWith(doc, stubEngine().engine);
    const dirs = drawn(state)
      .filter((each) => each.class === 'de-forced-lines')
      .map((each) => each.dir);
    expect(dirs).toEqual(['rtl', 'rtl']);
  });

  it('DOCE-PAGINATION-11.11 moves the breaks when the same words move to another block', () => {
    const doc = pagesDoc([[paragraph('first'), paragraph('second')]]);
    const first = positionOf(doc, 'first') + 1;
    const second = positionOf(doc, 'second') + 1;
    let pos = first;
    const { engine, state, breaks } = stateWithWords(doc, () => ({ pos, side: -80 }));
    expect(breaks(state).map((each) => each.pos)).toEqual([first]);
    pos = second;
    const moved = state.apply(state.tr);
    expect(breaks(moved).map((each) => each.pos)).toEqual([second]);
    // Editing after the anchor changes the text block's node and keeps the widget's position.
    const edited = moved.apply(moved.tr.insertText('x', second + 1));
    expect(breaks(edited).map((each) => each.pos)).toEqual([second]);
    engine.destroy();
  });

  it('DOCE-PAGINATION-11.2 DOCE-PAGINATION-11.11 measures the table row containing inserted words and leaves its lines to the browser', () => {
    const row = (text: string) =>
      create('table_row', null, [create('table_cell', null, [paragraph(text)])]);
    const table = create('table', null, [row('first'), row('second')]);
    const figure = create('table_figure', null, [create('table_caption', null), table]);
    const doc = pagesDoc([[figure]]);
    const first = positionOf(doc, 'first') + 1;
    const second = positionOf(doc, 'second') + 1;
    let pos = first;
    const { engine, state, breaks } = stateWithWords(doc, () => ({ pos, side: -80 }));
    const tablePos = first - 4;
    const rows = (on: EditorState) => {
      const box = objectBoxAt(on, tablePos);
      if (box?.kind !== 'table') throw new Error('no table box');
      return box.rows;
    };
    const measure = (on: EditorState) =>
      engine.measureBlock(figure, 'Body', insertedTexts(on, [forcedLinesKey])).measurement;
    expect(breaks(state)).toEqual([]);
    expect(pageTextLines(state)[0]?.blocks.find((block) => block.pos === first - 1)?.reason).toBe(
      'inserted words',
    );
    const firstRows = rows(state);
    expect(firstRows[0]).toBeGreaterThan(firstRows[1] ?? 0);
    const firstMeasurement = measure(state);

    pos = second;
    const moved = state.apply(state.tr);
    expect(breaks(moved)).toEqual([]);
    expect(rows(moved)).toEqual([...firstRows].reverse());
    expect(measure(moved)).not.toEqual(firstMeasurement);
    engine.destroy();
  });

  it('DOCE-PAGINATION-11.11 updates a caption’s breaks when the widgets’ sides change', () => {
    const caption = create('figure_caption', null, [documentSchema.text('Caption')]);
    const figure = create('figure', { src: 'a.png', width: 550, height: 100 }, [caption]);
    const doc = pagesDoc([[figure]]);
    const pos = positionOf(doc, 'Caption') + 1;
    let side = -80;
    const { engine, state, breaks } = stateWithWords(doc, () => ({ pos, side }));
    const [original] = breaks(state);
    expect(original?.pos).toBe(pos);
    side -= 100;
    const changed = state.apply(state.tr);
    expect(breaks(changed)[0]).toEqual({ pos, side: (original?.side ?? 0) - 100 });
    engine.destroy();
  });

  it("DOCE-PAGINATION-11.2 marks each paragraph in a table's cells, and leaves numbered ones alone", () => {
    const cell = (text: string, id: string) =>
      create('table_cell', null, [paragraph(text, { dataId: id })]);
    const table = create('table', null, [
      create('table_row', null, [cell('aaaaaaaaaabb', 'c1'), cell('cc', 'c2')]),
    ]);
    const figure = create('table_figure', null, [table]);
    const doc = pagesDoc([[figure]]);
    const first = positionOf(doc, 'aaaaaaaaaabb');
    const second = positionOf(doc, 'cc');
    const state = stateWith(doc, stubEngine({ paragraphs: new Set([second]) }).engine);
    expect(drawn(state)).toEqual([
      { from: first, to: first + 14, class: 'de-forced-lines', 'data-lines': '2', dir: 'ltr' },
      { from: first + 10, to: first + 11, class: 'de-forced-lines__end' },
    ]);
    const [page] = pageTextLines(state);
    expect(
      page?.blocks.map(({ elementId, lines, reason, nested }) => ({
        elementId,
        lines,
        reason,
        nested,
      })),
    ).toEqual([
      {
        elementId: 'c1',
        lines: [
          { from: 0, to: 10, text: 'aaaaaaaaaa' },
          { from: 10, to: 12, text: 'bb' },
        ],
        reason: undefined,
        nested: true,
      },
      { elementId: 'c2', lines: null, reason: 'numbered paragraph', nested: true },
    ]);
  });

  it("DOCE-PAGINATION-11.2 marks each paragraph in a list's items, but not a continuation's placeholder", () => {
    const placeholder = create('paragraph', { continuationPlaceholder: true });
    const item = (attrs: Record<string, unknown>, blocks: Node[]) =>
      create('list_item', attrs, blocks);
    const list = create('bullet_list', null, [
      item({ orphanedListContinuation: true, splitPartIndex: 1 }, [
        placeholder,
        create('bullet_list', null, [item({}, [paragraph('dd', { dataId: 'i2' })])]),
      ]),
    ]);
    const doc = pagesDoc([[list]]);
    const at = positionOf(doc, 'dd');
    const state = stateWith(doc, stubEngine().engine);
    expect(drawn(state)).toEqual([
      { from: at, to: at + 4, class: 'de-forced-lines', 'data-lines': '1', dir: 'ltr' },
    ]);
    const [page] = pageTextLines(state);
    expect(page?.blocks.map(({ elementId, nested }) => ({ elementId, nested }))).toEqual([
      { elementId: 'i2', nested: true },
    ]);
  });

  it("DOCE-PAGINATION-11.2 marks a code figure's code with the lines its figure was laid out with", () => {
    const code = create('code_block', { dataId: 'k1' }, [documentSchema.text('abcdefghijklmnop')]);
    const figure = create('code_figure', null, [
      create('code_caption', null, [documentSchema.text('Listing')]),
      code,
    ]);
    const { engine, calls } = stubEngine();
    const nested = vi.spyOn(engine, 'nestedLines');
    const doc = pagesDoc([[figure]]);
    const state = stateWith(doc, engine);
    const at = positionOf(doc, 'abcdefghijklmnop');
    const label = positionOf(doc, 'Listing');
    // The figure is laid out whole, its caption with its code.
    expect(nested).toHaveBeenCalledWith(figure, 'Body', {
      inserted: expect.objectContaining({ key: '' }),
      labelOf: undefined,
    });
    expect(calls.map(({ text }) => text)).toEqual(['Listing', 'abcdefghijklmnop']);
    const block = decorations(state)
      .find()
      .find((each) => each.from === at);
    expect(block?.spec).toEqual({ forcedLines: engine.lines(code, { scope: 'Body' }) });
    expect(drawn(state)).toEqual([
      { from: label, to: label + 9, class: 'de-forced-lines', 'data-lines': '1', dir: 'ltr' },
      { from: at, to: at + 18, class: 'de-forced-lines', 'data-lines': '2', dir: 'ltr' },
      { from: at + 10, to: at + 11, class: 'de-forced-lines__end' },
    ]);
    const [page] = pageTextLines(state);
    expect(
      page?.blocks.map(({ elementId, type, nested: inside }) => ({ elementId, type, inside })),
    ).toEqual([
      { elementId: '', type: 'code_caption', inside: true },
      { elementId: 'k1', type: 'code_block', inside: true },
    ]);
  });

  it("DOCE-PAGINATION-11.2 draws figures' and tables' captions on their lines, their indent before the label", () => {
    const figure = create('figure', { src: 'a.png', width: 40, height: 30 }, [
      create('figure_caption', null, [documentSchema.text('aaaaaaaaaabb')]),
    ]);
    const cell = create('table_cell', null, [paragraph('cc')]);
    const table = create('table', null, [create('table_row', null, [cell])]);
    const holder = create('table_figure', null, [
      create('table_caption', null, [documentSchema.text('dd')]),
      table,
    ]);
    const doc = pagesDoc([[figure, holder]]);
    const state = stateWith(doc, stubEngine({ left: 4 }).engine);
    const [first, second, third] = [
      positionOf(doc, 'aaaaaaaaaabb'),
      positionOf(doc, 'dd'),
      positionOf(doc, 'cc'),
    ];
    const indent = { style: '--de-first-indent: 4.000px' };
    const line = { class: 'de-forced-lines__start', style: '--de-line-indent: 4.000px' };
    expect(drawn(state)).toEqual([
      {
        from: first,
        to: first + 14,
        class: 'de-forced-lines',
        'data-lines': '2',
        dir: 'ltr',
        ...indent,
      },
      { from: first + 10, to: first + 11, class: 'de-forced-lines__end' },
      { from: first + 11, to: first + 12, ...line },
      {
        from: second,
        to: second + 4,
        class: 'de-forced-lines',
        'data-lines': '1',
        dir: 'ltr',
        ...indent,
      },
      { from: third, to: third + 4, class: 'de-forced-lines', 'data-lines': '1', dir: 'ltr' },
      { from: third + 1, to: third + 2, ...line },
    ]);
  });

  const lineOf = (from: number, to: number, left = 0): TextLine => ({
    from,
    to,
    width: 10,
    left,
    top: 0,
    height: 20,
    end: 'wrap',
  });

  // An engine that lays a caption out on the lines given, its other blocks as the stub does.
  function withCaptionLines(caption: Node, table: DrawnLines) {
    const { engine } = stubEngine();
    const own = engine.nestedLines.bind(engine);
    engine.nestedLines = (container, scope) =>
      new Map([...own(container, scope), [caption, table]]);
    return engine;
  }

  it("DOCE-PAGINATION-11.2 draws a later part's caption, the first part's text and the continued suffix, on its lines", () => {
    const code = create('code_block', { codeBlockContinued: true }, [documentSchema.text('ee')]);
    const caption = create('code_caption', { continuedText: 'Listing' });
    const figure = create('code_figure', null, [caption, code]);
    const text = 'Listing (continued)';
    const shown: DrawnLines = {
      width: 100,
      lines: [lineOf(0, 8), { ...lineOf(8, 19), end: 'end' }],
      height: 40,
      overhead: 0,
      justify: false,
      text,
    };
    const state = stateWith(pagesDoc([[figure]]), withCaptionLines(caption, shown));
    const [page] = pageTextLines(state);
    expect(page?.blocks.map(({ type, reason, lines }) => ({ type, reason, lines }))).toEqual([
      {
        type: 'code_caption',
        reason: undefined,
        lines: [
          { from: 0, to: 8, text: 'Listing ' },
          { from: 8, to: 19, text: '(continued)' },
        ],
      },
      { type: 'code_block', reason: undefined, lines: [{ from: 0, to: 2, text: 'ee' }] },
    ]);
    // The text is drawn before the empty content, its first line ended after its last character.
    const view = new EditorView(document.createElement('div'), { state });
    const drawnText = view.dom.querySelector('.doc-caption-text > .de-forced-lines__text');
    expect(drawnText?.innerHTML).toBe(
      'Listing<span class="de-forced-lines__end"> </span>(continued)',
    );
    view.destroy();
  });

  it('DOCE-PAGINATION-11.2 leaves out the captions the pages do not show', () => {
    const cell = () => create('table_cell', null, [paragraph('gg')]);
    const table = (attrs: Record<string, unknown> | null) =>
      create('table', attrs, [create('table_row', null, [cell()])]);
    const off = create('table_figure', null, [
      create('table_caption', null, [documentSchema.text('ff')]),
      table({ captionEnabled: false }),
    ]);
    const figure = create(
      'figure',
      { src: 'a.png', captionEnabled: false, width: 40, height: 30 },
      [create('figure_caption', null, [documentSchema.text('hh')])],
    );
    // A later part opening with a body row shows no caption.
    const headerless = create('table_figure', { splitPartIndex: 1 }, [
      create('table_caption', null),
      table({ splitPartIndex: 1 }),
    ]);
    const [page] = pageTextLines(
      stateWith(pagesDoc([[off, figure, headerless]]), stubEngine().engine),
    );
    expect(page?.blocks.map(({ type }) => type)).toEqual(['paragraph', 'paragraph']);
  });

  it('DOCE-PAGINATION-11.2 draws a caption whose label a line breaks inside in the parts its lines start', () => {
    const caption = create('table_caption', null, [documentSchema.text('ff')]);
    const table = create('table', null, [
      create('table_row', null, [create('table_cell', null, [paragraph('gg')])]),
    ]);
    const holder = create('table_figure', null, [caption, table]);
    const label: DrawnLines = {
      width: 100,
      lines: [lineOf(0, 0), { ...lineOf(0, 2, 4), end: 'end' }],
      height: 40,
      overhead: 0,
      justify: false,
      label: 'Table \n1 - ',
    };
    const doc = pagesDoc([[holder]]);
    const state = stateWith(doc, withCaptionLines(caption, label));
    const [page] = pageTextLines(state);
    expect(page?.blocks[0]?.lines?.map(({ text }) => text)).toEqual(['', 'ff']);
    // The content starts on the label's second line, which starts at its indent, not the text.
    const starts = drawn(state).filter((each) => each.class === 'de-forced-lines__start');
    expect(starts).toEqual([]);
    const view = new EditorView(document.createElement('div'), { state });
    const drawnLabel = view.dom.querySelector('.doc-caption-text > .de-forced-lines__label');
    expect(drawnLabel?.innerHTML).toBe(
      'Table <br><span class="de-forced-lines__start" style="--de-line-indent: 4.000px;">1 - </span>',
    );
    view.destroy();
  });

  it("DOCE-PAGINATION-11.2 hands linked code's view the lines of the code it is laid out as", () => {
    const linked = create('linked_code_block', {
      dataId: 'lk',
      code: 'abcdefghijklmn\nop',
      startLine: 7,
    });
    const { engine, calls } = stubEngine();
    const doc = pagesDoc([[linked]]);
    const state = stateWith(doc, engine);
    const code = linkedCodeFigure(linked)?.code;
    expect(code?.attrs.codeLineStart).toBe(7);
    expect(calls.map(({ text }) => text)).toEqual(['abcdefghijklmn\nop']);
    const [block, ...rest] = decorations(state).find();
    // One decoration on the atom's element, the lines in its spec; the view draws the marks.
    expect(rest).toEqual([]);
    expect(block?.spec).toEqual({ forcedLines: code && engine.lines(code, { scope: 'Body' }) });
    expect(drawn(state)).toEqual([
      {
        from: block?.from,
        to: (block?.from ?? 0) + 1,
        class: 'de-forced-lines',
        'data-lines': '2',
        dir: 'ltr',
      },
    ]);
    const [page] = pageTextLines(state);
    expect(
      page?.blocks.map(({ elementId, type, lines }) => ({ elementId, type, lines: lines?.length })),
    ).toEqual([{ elementId: 'lk', type: 'linked_code_block', lines: 2 }]);
  });

  it('DOCE-PAGINATION-11.2 hands linked code in a quote the lines its layout gave its code', () => {
    const linked = create('linked_code_block', { dataId: 'lq', code: 'abcdefghijklmn' });
    const quote = create('blockquote', null, [paragraph('aa', { dataId: 'q1' }), linked]);
    const { engine } = stubEngine();
    const state = stateWith(pagesDoc([[quote]]), engine);
    const code = linkedCodeFigure(linked)?.code;
    const atom = decorations(state)
      .find()
      .find(
        (each) =>
          (each.spec as { forcedLines?: unknown }).forcedLines !== undefined &&
          each.to - each.from === 1,
      );
    expect(atom?.spec).toEqual({ forcedLines: code && engine.lines(code, { scope: 'Body' }) });
    const [page] = pageTextLines(state);
    expect(page?.blocks.map(({ elementId, nested }) => ({ elementId, nested }))).toEqual([
      { elementId: 'q1', nested: true },
      { elementId: 'lq', nested: true },
    ]);
  });

  it("DOCE-PAGINATION-11.2 marks each paragraph in a layout section's columns, and in their lists", () => {
    const column = (blocks: Node[]) => create('layout_column', null, blocks);
    const item = create('list_item', null, [paragraph('bb', { dataId: 'l1' })]);
    const section = create('layout_section', { preset: 'halves' }, [
      column([paragraph('aaaaaaaaaaa', { dataId: 'c1' })]),
      column([create('bullet_list', null, [item])]),
    ]);
    const doc = pagesDoc([[section]]);
    const first = positionOf(doc, 'aaaaaaaaaaa');
    const second = positionOf(doc, 'bb');
    const state = stateWith(doc, stubEngine().engine);
    expect(drawn(state)).toEqual([
      { from: first, to: first + 13, class: 'de-forced-lines', 'data-lines': '2', dir: 'ltr' },
      { from: first + 10, to: first + 11, class: 'de-forced-lines__end' },
      { from: second, to: second + 4, class: 'de-forced-lines', 'data-lines': '1', dir: 'ltr' },
    ]);
    const [page] = pageTextLines(state);
    expect(page?.blocks.map(({ elementId, nested }) => ({ elementId, nested }))).toEqual([
      { elementId: 'c1', nested: true },
      { elementId: 'l1', nested: true },
    ]);
  });

  it('DOCE-PAGINATION-11.2 marks each paragraph in a quote', () => {
    const quote = create('blockquote', null, [paragraph('qq', { dataId: 'q1' })]);
    const doc = pagesDoc([[quote]]);
    const at = positionOf(doc, 'qq');
    const state = stateWith(doc, stubEngine().engine);
    expect(drawn(state)).toEqual([
      { from: at, to: at + 4, class: 'de-forced-lines', 'data-lines': '1', dir: 'ltr' },
    ]);
    const [page] = pageTextLines(state);
    expect(page?.blocks.map(({ elementId, nested }) => ({ elementId, nested }))).toEqual([
      { elementId: 'q1', nested: true },
    ]);
  });

  it("DOCE-PAGINATION-11.2 marks each paragraph in a script block's output and in an embed", () => {
    const script = create('script_block', null, [paragraph('ss', { dataId: 's1' })]);
    const embed = create('embed', null, [paragraph('ee', { dataId: 'e1' })]);
    const doc = pagesDoc([[script, embed]]);
    const state = stateWith(doc, stubEngine().engine);
    const forced = drawn(state).filter((each) => each.class === 'de-forced-lines');
    expect(forced.map(({ from }) => from)).toEqual([positionOf(doc, 'ss'), positionOf(doc, 'ee')]);
    const [page] = pageTextLines(state);
    expect(page?.blocks.map(({ elementId, nested }) => ({ elementId, nested }))).toEqual([
      { elementId: 's1', nested: true },
      { elementId: 'e1', nested: true },
    ]);
  });

  it('DOCE-PAGINATION-11.2 never cuts a character in two at a line end', () => {
    const doc = pagesDoc([[paragraph('aaaaaaaa😀bb')]]);
    const state = stateWith(doc, stubEngine().engine);
    const at = positionOf(doc, 'aaaaaaaa😀bb');
    const ends = drawn(state).filter((each) => each.class === 'de-forced-lines__end');
    expect(ends).toEqual([{ from: at + 9, to: at + 11, class: 'de-forced-lines__end' }]);
  });

  it('DOCE-PAGINATION-11.2 indents aligned lines and stretches the spaces of justified ones', () => {
    const doc = pagesDoc([[paragraph('aaaa bbbb cccc')]]);
    const state = stateWith(doc, stubEngine({ left: 30, justify: true }).engine);
    const at = positionOf(doc, 'aaaa bbbb cccc');
    const lines = drawn(state).filter((each) => each.class !== 'de-forced-lines');
    expect(lines).toEqual([
      {
        from: at + 1,
        to: at + 2,
        class: 'de-forced-lines__start',
        style: '--de-line-indent: 30.000px',
      },
      {
        from: at + 1,
        to: at + 10,
        class: 'de-forced-lines__justified',
        style: '--de-word-spacing: 90.000px',
      },
      { from: at + 10, to: at + 11, class: 'de-forced-lines__end' },
      {
        from: at + 11,
        to: at + 12,
        class: 'de-forced-lines__start',
        style: '--de-line-indent: 30.000px',
      },
    ]);
  });

  it('DOCE-PAGINATION-11.2 justifies and hyphenates the last line of a part that another part continues', () => {
    const head = paragraph('aaaa bbbb cccc dd­', { dataId: 'p1', splitPartIndex: 0 });
    const tail = paragraph('ee ff', { dataId: 'p1', splitPartIndex: 1 });
    const doc = pagesDoc([[head], [tail]]);
    const state = stateWith(doc, stubEngine({ justify: true }).engine);
    const at = positionOf(doc, head.textContent);
    const lines = drawn(state).filter(
      (each) => Number(each.from) > at && Number(each.to) <= at + head.nodeSize,
    );
    // The head's last line, which the page break ends, is a wrapped line of the whole block.
    expect(lines.slice(-2)).toEqual([
      {
        from: at + 11,
        to: at + 19,
        class: 'de-forced-lines__justified',
        style: '--de-word-spacing: 90.000px',
      },
      { from: at + 18, to: at + 19, class: 'de-forced-lines__end de-forced-lines__hyphen' },
    ]);
    // The paragraph's true last line is not.
    const end = positionOf(doc, 'ee ff');
    expect(drawn(state).filter((each) => Number(each.from) > end)).toEqual([]);
  });

  it('DOCE-PAGINATION-11.2 leaves ragged the last line of a part whose next part starts at a hard break', () => {
    const head = paragraph('aaaa bbbb cccc dd', { dataId: 'p1', splitPartIndex: 0 });
    const breakNode = documentSchema.nodes.hard_break?.create();
    if (!breakNode) throw new Error('hard_break');
    const tail = create('paragraph', { dataId: 'p1', splitPartIndex: 1 }, [
      breakNode,
      documentSchema.text('ee'),
    ]);
    const doc = pagesDoc([[head], [tail]]);
    const state = stateWith(doc, stubEngine({ justify: true }).engine);
    const at = positionOf(doc, head.textContent);
    const classes = drawn(state)
      .filter((each) => Number(each.from) > at + 10 && Number(each.to) <= at + head.nodeSize)
      .map((each) => each.class);
    expect(classes).toEqual([]);
  });

  it('DOCE-PAGINATION-11.2 draws a kept page again when the part after it starts or stops at a hard break', () => {
    const head = paragraph('aaaa bbbb cccc dd', { dataId: 'p1', splitPartIndex: 0 });
    const tail = paragraph('ee ff', { dataId: 'p1', splitPartIndex: 1 });
    const doc = pagesDoc([[head], [tail]]);
    const state = stateWith(doc, stubEngine({ justify: true }).engine);
    const at = positionOf(doc, head.textContent);
    const lastLine = (on: EditorState) =>
      drawn(on)
        .filter((each) => Number(each.from) > at + 10 && Number(each.to) <= at + head.nodeSize)
        .map((each) => each.class);
    const breakNode = documentSchema.nodes.hard_break?.create();
    if (!breakNode) throw new Error('hard_break');
    const tailAt = positionOf(doc, 'ee ff');
    expect(lastLine(state)).toEqual(['de-forced-lines__justified', 'de-forced-lines__end']);
    // A break typed at the top of the next part ends the paragraph's run there: the head's last
    // line is the block's own last line again, though the head's page is the same node.
    const broken = state.apply(state.tr.insert(tailAt + 1, breakNode));
    expect(lastLine(broken)).toEqual([]);
    // And taken out again, it wraps on into the next part.
    const joined = broken.apply(broken.tr.delete(tailAt + 1, tailAt + 2));
    expect(lastLine(joined)).toEqual(['de-forced-lines__justified', 'de-forced-lines__end']);
  });

  it("DOCE-PAGINATION-11.2 gives a heading's first part the engine's number and leaves numbered paragraphs alone", () => {
    const heading = create('heading', { level: 1, dataId: 'h1' }, [documentSchema.text('Scope')]);
    const rest = create('heading', { level: 1, dataId: 'h1', splitPartIndex: 1 }, [
      documentSchema.text('more'),
    ]);
    const numbered = paragraph('item');
    const doc = pagesDoc([[heading, numbered], [rest]]);
    const headings = new Map([
      [positionOf(doc, 'Scope'), '1 '],
      [positionOf(doc, 'more'), '1 '],
    ]);
    const { engine, calls } = stubEngine({
      headings,
      paragraphs: new Set([positionOf(doc, 'item')]),
    });
    const blocks = drawn(stateWith(doc, engine)).filter((each) => each.class === 'de-forced-lines');
    expect(blocks.map((each) => each['data-number'])).toEqual(['1 ', undefined]);
    expect(calls).toEqual([
      { text: 'Scope', scope: 'Body', prefix: '1 ' },
      { text: 'more', scope: 'Body', prefix: undefined },
    ]);
  });

  it('DOCE-PAGINATION-11.2 lays out only the changed block again on a keystroke', () => {
    const doc = pagesDoc([[paragraph('first')], [paragraph('second')]]);
    const { engine, calls } = stubEngine();
    const state = stateWith(doc, engine);
    const kept = (on: EditorState) => {
      const at = positionOf(on.doc, 'second');
      const first = decorations(on).find(at, at + 8)[0] as unknown as { type: unknown } | undefined;
      return first?.type;
    };
    const before = kept(state);
    calls.length = 0;
    const typed = state.apply(state.tr.insertText('x', positionOf(doc, 'first') + 1));
    expect(calls.map((call) => call.text)).toEqual(['xfirst']);
    expect(kept(typed)).toBe(before);
  });

  it("DOCE-PAGINATION-11.2 draws a cell again when another cell's text moves its lines", () => {
    const cell = (text: string) => create('table_cell', null, [paragraph(text)]);
    const table = create('table', null, [
      create('table_row', null, [cell('aaaa'), cell('bbbbbbbb')]),
    ]);
    const doc = pagesDoc([[create('table_figure', null, [table])]]);
    // The second cell narrows as the first one grows, as an automatic column width does.
    const narrow = stubEngine({ perLine: 4 }).engine;
    const wide = stubEngine({ perLine: 10 }).engine;
    const engine: PagesTextEngine = {
      ...wide,
      nestedLines: (container, scope) =>
        (container.textContent.length > 12 ? narrow : wide).nestedLines(container, scope),
    };
    const state = stateWith(doc, engine);
    const lineCount = (on: EditorState) =>
      drawn(on)
        .filter((each) => each.class === 'de-forced-lines')
        .map((each) => each['data-lines']);
    expect(lineCount(state)).toEqual(['1', '1']);
    const typed = state.apply(state.tr.insertText('x', positionOf(doc, 'aaaa') + 1));
    expect(lineCount(typed)).toEqual(['2', '2']);
  });

  // An engine whose lines of one block hold `width` characters a line, which a test changes as a
  // renumbering or a stored value would.
  const widening = (state: { perLine: number; numbers: number }) => {
    const engine: PagesTextEngine = {
      ...stubEngine().engine,
      numbersVersion: () => state.numbers,
      lines: (node, place) => stubEngine({ perLine: state.perLine }).engine.lines(node, place),
    };
    return engine;
  };
  const lineCountOf = (on: EditorState, text: string) => {
    const at = positionOf(on.doc, text);
    const block = drawn(on).find((each) => each.from === at && each.class === 'de-forced-lines');
    return block?.['data-lines'];
  };

  it('DOCE-PAGINATION-11.2 redraws unchanged pages and their nested blocks in a different section scope', () => {
    installFakeCanvas();
    const engine = createPagesTextEngine({
      template: {
        ...BASE_TEMPLATE,
        sections: [{ name: 'narrow', page: { margins: { left: '305px', right: '305px' } } }],
      },
    });
    const body = 'Body text with room to wrap '.repeat(8);
    const nested = 'Quoted text with room to wrap '.repeat(8);
    const reused = page([paragraph(body), create('blockquote', null, [paragraph(nested)])]);
    const stable = create('page_section', { sectionName: 'stable' }, [page([paragraph('Other')])]);
    const doc = create('doc', null, [
      create('page_section', { sectionName: 'Body' }, [reused]),
      stable,
    ]);
    const state = stateWith(doc, engine);
    const otherDecoration = (on: EditorState) => {
      const pos = positionOf(on.doc, 'Other');
      const found = decorations(on).find(pos, pos + 7)[0];
      return (found as unknown as { type: unknown } | undefined)?.type;
    };
    const moved = state.apply(state.tr.setNodeMarkup(0, undefined, { sectionName: 'narrow' }));
    expect(moved.doc.firstChild?.firstChild).toBe(reused);
    const fresh = stateWith(moved.doc, engine);
    expect(Number(lineCountOf(fresh, body))).toBeGreaterThan(Number(lineCountOf(state, body)));
    expect(Number(lineCountOf(fresh, nested))).toBeGreaterThan(Number(lineCountOf(state, nested)));
    // The ranges of the line-end marks must change as well as the block's number of lines.
    expect(drawn(moved)).toEqual(drawn(fresh));
    expect(otherDecoration(moved)).toBe(otherDecoration(state));
    engine.destroy();
  });

  it('DOCE-PAGINATION-11.2 redraws the contents on a kept page after an unnumbered heading changes', () => {
    installFakeCanvas();
    const engine = createPagesTextEngine({ template: BASE_TEMPLATE });
    const heading = create('heading', { level: 1, numbered: false }, [
      documentSchema.text('Short'),
    ]);
    const doc = pagesDoc([[create('toc_block', null)], [heading], [paragraph('Untouched')]]);
    engine.number(doc);
    const state = stateWith(doc, engine);
    expect(contentsDrawing(state)?.rows).toEqual([[0]]);
    expect(engine.numbering(doc).headings.size).toBe(0);

    const text = ' a significantly longer heading'.repeat(12);
    const edited = state.tr.insertText(text, positionOf(doc, 'Short') + 1 + heading.content.size);
    engine.number(edited.doc);
    const moved = state.apply(edited);
    expect(moved.doc.firstChild?.firstChild).toBe(doc.firstChild?.firstChild);
    expect(engine.numbering(moved.doc).headings.size).toBe(0);
    const drawing = contentsDrawing(moved);
    expect(drawing?.rows[0]?.length).toBeGreaterThan(1);
    expect(drawing).toEqual(contentsDrawing(stateWith(moved.doc, engine)));

    const unrelated = moved.tr.insertText('x', positionOf(moved.doc, 'Untouched') + 1);
    engine.number(unrelated.doc);
    expect(contentsDrawing(moved.apply(unrelated))).toBe(drawing);
    engine.destroy();
  });

  it('DOCE-PAGINATION-11.2 DOCE-PAGINATION-10.11 redraws contents boxes when the digit allowance changes', () => {
    installFakeCanvas();
    const engine = createPagesTextEngine({ template: BASE_TEMPLATE });
    const heading = create('heading', { level: 1, numbered: false }, [documentSchema.text('Part')]);
    const doc = pagesDoc([[create('toc_block', null)], [heading]]);
    engine.number(doc);
    const state = stateWith(doc, engine);
    const width = contentsDrawing(state)?.pageWidths[0] ?? 0;
    expect(width).toBeGreaterThan(0);

    engine.pageDigits(1000);
    const laid = state.apply(state.tr.setMeta(paginationKey, true));
    expect(laid.doc).toBe(doc);
    expect(contentsDrawing(laid)?.pageWidths[0]).toBeCloseTo((width * 4) / 3, 1);
    engine.destroy();
  });

  it("DOCE-PAGINATION-11.2 draws an unchanged page again when the footnotes' numbers move", () => {
    const doc = pagesDoc([[paragraph('first')], [paragraph('aaaaaaaaaaaa')]]);
    const held = { perLine: 20, numbers: 0 };
    const state = stateWith(doc, widening(held));
    expect(lineCountOf(state, 'aaaaaaaaaaaa')).toBe('1');
    // A footnote cited on the first page renumbers a marker on the second, which widens.
    held.perLine = 10;
    held.numbers = 1;
    const typed = state.apply(state.tr.insertText('x', positionOf(doc, 'first') + 1));
    expect(lineCountOf(typed, 'aaaaaaaaaaaa')).toBe('2');
  });

  it('DOCE-PAGINATION-11.2 draws an unchanged page again when a stored variable value changes', () => {
    const doc = pagesDoc([[paragraph('first')], [paragraph('aaaaaaaaaaaa')]]);
    const held = { perLine: 20, numbers: 0 };
    const state = stateWith(doc, widening(held));
    expect(lineCountOf(state, 'aaaaaaaaaaaa')).toBe('1');
    // The value a variable on the second page shows grows, as the engine lays it out.
    held.perLine = 10;
    const stored = state.apply(state.tr.setDocAttribute('values', { title: 'A longer title' }));
    expect(lineCountOf(stored, 'aaaaaaaaaaaa')).toBe('2');
  });

  it('DOCE-PAGINATION-11.2 draws a heading again when its number moves to another heading', () => {
    const heading = (text: string) => create('heading', { level: 1 }, [documentSchema.text(text)]);
    // The engine numbers the headings in order, as the template does.
    const engine: PagesTextEngine = {
      ...stubEngine().engine,
      numbering: (doc) => {
        const headings = new Map<number, string>();
        doc.descendants((node, pos) => {
          if (node.type.name === 'heading') headings.set(pos, `${String(headings.size + 1)} `);
          return !node.isTextblock;
        });
        return { headings, paragraphs: new Set() };
      },
    };
    const doc = pagesDoc([[heading('One')], [heading('Two')], [heading('Three')]]);
    const state = stateWith(doc, engine);
    const numberOf = (on: EditorState, text: string) => {
      const at = positionOf(on.doc, text);
      return drawn(on).find((each) => each.from === at && each.class === 'de-forced-lines')?.[
        'data-number'
      ];
    };
    expect(numberOf(state, 'Two')).toBe('2 ');
    // One step takes the first heading out and another adds one on the last page: the numbers in
    // order are the same, but the second page's heading is now the first.
    const one = positionOf(doc, 'One');
    const tr = state.tr.setNodeMarkup(one, documentSchema.nodes.paragraph);
    const three = positionOf(tr.doc, 'Three');
    tr.insert(three + heading('Three').nodeSize, heading('Four'));
    const moved = state.apply(tr);
    expect(numberOf(moved, 'Two')).toBe('1 ');
    expect(numberOf(moved, 'Four')).toBe('3 ');
  });

  it('DOCE-PAGINATION-11.2 draws nothing until the engine has loaded, and draws once it has', () => {
    const doc = pagesDoc([[paragraph('first')]]);
    let engine: PagesTextEngine | null = null;
    let version = 0;
    const source = { engine: () => engine, version: () => version };
    const state = EditorState.create({ doc, plugins: [forcedLines(source)] });
    expect(decorations(state).find()).toEqual([]);
    engine = stubEngine().engine;
    version += 1;
    const loaded = state.apply(state.tr.setMeta('loaded', true));
    expect(decorations(loaded).find()).toHaveLength(1);
  });
});

describe('pageTextLines', () => {
  it('DOCE-PAGINATION-11.3 gives each page its blocks, with lines at their offsets in the whole block', () => {
    const head = paragraph('aaaaaaaaaabbbbbbbbbb', { dataId: 'p1' });
    const rest = paragraph('cccccccccc', { dataId: 'p1', splitPartIndex: 1 });
    const doc = pagesDoc([[head], [rest, paragraph('item', { dataId: 'p2' })]]);
    const { engine } = stubEngine({ paragraphs: new Set([positionOf(doc, 'item')]) });
    const pages = pageTextLines(stateWith(doc, engine));
    expect(pages).toEqual([
      {
        blocks: [
          {
            elementId: 'p1',
            part: 0,
            type: 'paragraph',
            pos: positionOf(doc, 'aaaaaaaaaabbbbbbbbbb'),
            start: 0,
            lines: [
              { from: 0, to: 10, text: 'aaaaaaaaaa' },
              { from: 10, to: 20, text: 'bbbbbbbbbb' },
            ],
          },
        ],
      },
      {
        blocks: [
          {
            elementId: 'p1',
            part: 1,
            type: 'paragraph',
            pos: positionOf(doc, 'cccccccccc'),
            start: 20,
            lines: [{ from: 20, to: 30, text: 'cccccccccc' }],
          },
          {
            elementId: 'p2',
            part: 0,
            type: 'paragraph',
            pos: positionOf(doc, 'item'),
            start: 0,
            lines: null,
            reason: 'numbered paragraph',
          },
        ],
      },
    ]);
  });

  it("DOCE-PAGINATION-11.3 leaves inline atoms out of a line's text, as the writer did not type it", () => {
    const math = create('math_inline', null, [documentSchema.text('x^2')]);
    const block = create('paragraph', { dataId: 'p1' }, [
      documentSchema.text('aa '),
      math,
      documentSchema.text(' bb'),
    ]);
    const { engine } = stubEngine({ perLine: 100 });
    const lines = pageTextLines(stateWith(pagesDoc([[block]]), engine))[0]?.blocks[0]?.lines;
    expect(lines?.map((line) => line.text)).toEqual(['aa  bb']);
  });

  it('DOCE-PAGINATION-11.3 gives no pages without the layout engine', () => {
    expect(pageTextLines(stateWith(pagesDoc([[paragraph('text')]]), null))).toEqual([]);
  });
});

describe('forced lines on the pages near the screen', () => {
  // An IntersectionObserver the test drives: `show` reports which observed elements are near.
  function stubObserver() {
    const observers: FakeObserver[] = [];
    class FakeObserver {
      readonly observed = new Set<Element>();
      constructor(
        readonly report: (entries: { target: Element; isIntersecting: boolean }[]) => void,
      ) {
        observers.push(this);
      }
      observe(element: Element) {
        this.observed.add(element);
      }
      unobserve(element: Element) {
        this.observed.delete(element);
      }
      disconnect() {
        this.observed.clear();
      }
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    return (near: (element: Element) => boolean) => {
      for (const observer of observers)
        observer.report(
          [...observer.observed].map((target) => ({ target, isIntersecting: near(target) })),
        );
    };
  }

  function mounted(doc: Node, engine: PagesTextEngine) {
    let view: EditorView | null = null;
    const redraw = () => view?.dispatch(view.state.tr.setMeta(forcedLinesKey, true));
    const state = EditorState.create({
      doc,
      plugins: [forcedLines({ engine: () => engine, version: () => 0, redraw })],
    });
    view = new EditorView(document.createElement('div'), { state });
    return view;
  }

  const forcedTexts = (view: EditorView) =>
    [...view.dom.querySelectorAll('.de-forced-lines')].map((element) => element.textContent);

  it('DOCE-PAGINATION-11.6 draws forced lines on the pages near the screen and the caret page only', () => {
    const show = stubObserver();
    const doc = pagesDoc([[paragraph('first')], [paragraph('second')], [paragraph('third')]]);
    const view = mounted(doc, stubEngine().engine);
    expect(forcedTexts(view)).toEqual(['first', 'second', 'third']);
    const third = view.dom.querySelectorAll('.pm-page')[2];
    show((element) => element === third);
    // The caret is on the first page, so it stays drawn.
    expect(forcedTexts(view)).toEqual(['first', 'third']);
    expect(forcedLinesKey.getState(view.state)?.drawn).toEqual(new Set([2]));
    view.destroy();
  });
});

describe('the caret at a forced line start', () => {
  // Where the caret is drawn after the view writes the position between a block's two lines,
  // in a view mounted in `mount`.
  function caretBetweenLines(mount: HTMLElement, engine: PagesTextEngine) {
    const doc = pagesDoc([[paragraph('aaaaaaaaaabbbbbbbbbb')]]);
    const state = EditorState.create({
      doc,
      plugins: [forcedLines({ engine: () => engine, version: () => 0 })],
    });
    const view = new EditorView(mount, { state });
    view.focus();
    const at = positionOf(doc, 'aaaaaaaaaabbbbbbbbbb') + 11;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
    const selection = document.getSelection();
    const drawn = { text: selection?.anchorNode?.textContent, offset: selection?.anchorOffset };
    view.destroy();
    return drawn;
  }

  it('DOCE-PAGINATION-11.7 draws the caret at the next line start when the line ends in a box of its own', () => {
    const base = stubEngine().engine;
    // The first line's last character is drawn in a reserved box inside the line's end mark.
    const engine: PagesTextEngine = {
      ...base,
      lines: (node, place) => {
        const table = base.lines(node, place);
        return table && { ...table, reserved: [{ from: 9, to: 10, width: 8 }] };
      },
    };
    const mount = document.body.appendChild(document.createElement('div'));
    expect(caretBetweenLines(mount, engine)).toEqual({ text: 'bbbbbbbbbb', offset: 0 });
    mount.remove();
  });

  it('DOCE-PAGINATION-11.7 draws a caret the view wrote at a line end at the next line start', () => {
    const doc = pagesDoc([[paragraph('aaaaaaaaaabbbbbbbbbb')]]);
    const state = EditorState.create({
      doc,
      plugins: [forcedLines({ engine: () => stubEngine().engine, version: () => 0 })],
    });
    const mount = document.body.appendChild(document.createElement('div'));
    const view = new EditorView(mount, { state });
    view.focus();
    // The position between the two lines, which ProseMirror writes after the first line's text.
    const at = positionOf(doc, 'aaaaaaaaaabbbbbbbbbb') + 11;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
    const selection = document.getSelection();
    expect(selection?.anchorNode?.textContent).toBe('bbbbbbbbbb');
    expect(selection?.anchorOffset).toBe(0);
    view.destroy();
    mount.remove();
  });
});
