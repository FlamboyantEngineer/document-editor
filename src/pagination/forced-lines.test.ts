import type { Node } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { type Decoration, type DecorationSet, EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import type { TextLine } from '../layout-engine/line-table.js';
import { forcedLines, forcedLinesKey } from './forced-lines.js';
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
    number: () => undefined,
    numbering: () => ({
      headings: options.headings ?? new Map(),
      paragraphs: options.paragraphs ?? new Set(),
    }),
    measureBlock: () => null,
    measureRegion: () => null,
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

describe('forcedLines', () => {
  it('DOCE-PAGINATION-11.2 marks each top-level paragraph and ends each wrapped line', () => {
    const doc = pagesDoc([[paragraph('aaaaaaaaaabbbbbbbbbbcc', { dataId: 'p1' })]]);
    const state = stateWith(doc, stubEngine().engine);
    const at = positionOf(doc, 'aaaaaaaaaabbbbbbbbbbcc');
    expect(drawn(state)).toEqual([
      { from: at, to: at + 24, class: 'de-forced-lines', 'data-lines': '3' },
      { from: at + 10, to: at + 11, class: 'de-forced-lines__end' },
      { from: at + 20, to: at + 21, class: 'de-forced-lines__end' },
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
