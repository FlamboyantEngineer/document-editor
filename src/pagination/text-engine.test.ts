import type { MeasureContext } from '@chenglou/pretext';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../../test/canvas-fixtures.js';
import { findNode, parseMarkup } from '../../test/document-markup.js';
import { type LayoutBlock, splitParagraph } from '../model/index.js';
import { createDocumentSchema } from '../model/schema/document-schema.js';
import { BASE_TEMPLATE } from '../model/templates/base-template.js';
import { footnoteAreaHeight, footnoteAreaOf } from './measure-footnotes.js';
import type { ServedFonts } from './served-fonts.js';
import { createPagesTextEngine } from './text-engine.js';
import { holdTextEngine } from './text-engine-holder.js';

const WORDS = Array.from({ length: 60 }, () => 'aaaa').join(' ');

function paragraph(text: string) {
  const node = findNode(parseMarkup(`<p>${text}</p>`), 'paragraph');
  if (!node) throw new Error('no paragraph');
  return node;
}

beforeEach(() => {
  installFakeCanvas();
});

describe('createPagesTextEngine', () => {
  it('DOCE-PAGINATION-11.1 lays a paragraph out once, and keeps it while its node does', () => {
    const measureIn = document.createElement('div');
    const engine = createPagesTextEngine({
      template: BASE_TEMPLATE,
      measureIn,
      onAtomsSettled: () => undefined,
    });
    const node = paragraph(WORDS);
    const block = engine.measureBlock(node, null);
    expect(block?.height).toBeGreaterThan(0);
    expect(engine.measureBlock(node, null)).toBe(block);
    expect(engine.stats().laid).toBe(1);
    expect(measureIn.querySelector('.de-atom-measure')).not.toBeNull();
    engine.destroy();
    expect(measureIn.querySelector('.de-atom-measure')).toBeNull();
  });

  it('DOCE-PAGINATION-11.1 DOCE-PAGINATION-7.17 leaves a block a host view draws, or one holding it, to be measured as drawn', () => {
    const engine = createPagesTextEngine({
      template: BASE_TEMPLATE,
      measureIn: document.createElement('div'),
      onAtomsSettled: () => undefined,
      hostViews: ['blockquote'],
    });
    const quote = findNode(parseMarkup(`<blockquote><p>${WORDS}</p></blockquote>`), 'blockquote');
    const list = findNode(
      parseMarkup('<ul><li><p>a</p><blockquote><p>b</p></blockquote></li></ul>'),
      'bullet_list',
    );
    if (!quote || !list) throw new Error('no blocks');
    expect(engine.measureBlock(quote, null)).toBeNull();
    expect(engine.measureBlock(list, null)).toBeNull();
    expect(engine.measureBlock(paragraph(WORDS), null)).not.toBeNull();
    expect(engine.stats().reasons.get('drawn by a host view')).toBe(2);
    engine.destroy();
  });

  it('DOCE-PAGINATION-11.12 measures a block with a suggestion again in another markup', () => {
    let markup: 'all' | 'final' | 'original' = 'all';
    const engine = createPagesTextEngine({
      template: BASE_TEMPLATE,
      measureIn: document.createElement('div'),
      onAtomsSettled: () => undefined,
      markup: () => markup,
    });
    const suggested = paragraph(`aaaa <del data-id="s1">${WORDS}</del>`);
    const plain = paragraph(WORDS);
    const all = engine.measureBlock(suggested, null);
    const kept = engine.measureBlock(plain, null);
    markup = 'final';
    const final = engine.measureBlock(suggested, null);
    expect(final?.height).toBeLessThan(all?.height ?? 0);
    expect(engine.lines(suggested, { scope: null })?.lines).toHaveLength(1);
    // A block without a suggestion keeps its measure in every markup.
    expect(engine.measureBlock(plain, null)).toBe(kept);
    markup = 'original';
    expect(engine.measureBlock(suggested, null)?.height).toBe(all?.height);
    engine.destroy();
  });

  it('DOCE-PAGINATION-11.2 gives the lines it measured a paragraph with, tiling its content', () => {
    const engine = createPagesTextEngine({
      template: BASE_TEMPLATE,
      measureIn: document.createElement('div'),
      onAtomsSettled: () => undefined,
    });
    const node = paragraph(WORDS);
    const table = engine.lines(node, { scope: null });
    const lines = table?.lines ?? [];
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]?.from).toBe(0);
    expect(lines.at(-1)?.to).toBe(node.content.size);
    expect(lines.slice(1).map((line) => line.from)).toEqual(
      lines.slice(0, -1).map((line) => line.to),
    );
    expect(engine.lines(node, { scope: null })).toBe(table);
    engine.destroy();
  });

  it('DOCE-PAGINATION-12.4 reserves the widths of an inserted word in its block font', () => {
    const fonts: string[] = [];
    const engine = createPagesTextEngine({
      template: BASE_TEMPLATE,
      measureIn: document.createElement('div'),
      onAtomsSettled: () => undefined,
      reserve: (cluster, font) => {
        fonts.push(font);
        return cluster === '\u2603' ? 12 : null;
      },
    });
    expect(engine.insertedReserved(paragraph('kept'), null, 'a\u2603b\u2603 ')).toEqual([
      { from: 1, to: 2, width: 12 },
      { from: 3, to: 4, width: 12 },
    ]);
    // The paragraph's own font, as the inserted word is laid out in.
    expect(new Set(fonts).size).toBe(1);
    expect(fonts[0]).toMatch(/px /u);
    engine.destroy();
    const plain = createPagesTextEngine({
      template: BASE_TEMPLATE,
      measureIn: document.createElement('div'),
      onAtomsSettled: () => undefined,
    });
    expect(plain.insertedReserved(paragraph('kept'), null, '\u2603')).toEqual([]);
    plain.destroy();
  });

  it('DOCE-PAGINATION-10.9 lays blocks out with the template’s numbers, not the page’s stylesheet', () => {
    const measureIn = document.createElement('div');
    measureIn.style.setProperty('--de-quote-spacing', '50px');
    document.body.append(measureIn);
    const template = {
      ...BASE_TEMPLATE,
      styles: { ...BASE_TEMPLATE.styles, blocks: { quoteSpacing: '30px' } },
    };
    const engine = createPagesTextEngine({ template, measureIn, onAtomsSettled: () => undefined });
    const quote = findNode(parseMarkup(`<blockquote><p>${WORDS}</p></blockquote>`), 'blockquote');
    if (!quote) throw new Error('no quote');
    expect(engine.measureBlock(quote, null)).toMatchObject({ marginTop: 30, marginBottom: 30 });
    engine.destroy();
    measureIn.remove();
  });
});

describe('the engine on page regions', () => {
  const schema = createDocumentSchema();
  const type = (name: string) => {
    const found = schema.nodes[name];
    if (!found) throw new Error(`no ${name}`);
    return found;
  };
  const text = (value: string) => schema.text(value);
  const engine = () =>
    createPagesTextEngine({
      template: BASE_TEMPLATE,
      measureIn: document.createElement('div'),
      onAtomsSettled: () => undefined,
    });

  it('DOCE-PAGINATION-11.10 lays a header out with its gap, keeps it by node, and refuses a block', () => {
    const pages = engine();
    const header = type('page_header').create(null, [
      type('paragraph').create(null, text('Header')),
    ]);
    const room = pages.measureRegion(header, null);
    expect(room?.height).toBeGreaterThan(0);
    expect(room?.children).toHaveLength(1);
    expect(pages.measureRegion(header, null)).toBe(room);
    expect(pages.measureRegion(type('page_header').create(), null)).toMatchObject({
      height: 0,
    });
    expect(pages.measureRegion(paragraph(WORDS), null)).toBeNull();
    pages.destroy();
  });

  it('DOCE-PAGINATION-11.10 lays a footer with a template variable out with the text it shows', () => {
    const pages = engine();
    const variable = type('template_variable').create({ variableKey: 'page.current' });
    const footer = type('page_footer').create(null, [
      type('paragraph').create(null, [text('Page '), variable]),
    ]);
    expect(pages.measureRegion(footer, null)).toBeNull();
    const first = pages.measureRegion(footer, null, new Map([['page.current', '1']]));
    expect(first?.height).toBeGreaterThan(0);
    expect(pages.measureRegion(footer, null, new Map([['page.current', '1']]))).toBe(first);
    // Another value lays the footer out again.
    const next = pages.measureRegion(footer, null, new Map([['page.current', '12']]));
    expect(next).not.toBe(first);
    expect(next?.height).toBe(first?.height);
    // The lines of its paragraph, laid out with the text the variable shows.
    const [paragraph] = footer.children;
    if (!paragraph) throw new Error('no paragraph');
    const texts = new Map([['page.current', '12']]);
    expect(pages.regionLines(footer, null, texts).get(paragraph)?.lines).toHaveLength(1);
    expect(pages.regionLines(footer, null).size).toBe(0);
    pages.destroy();
  });

  it("DOCE-PAGINATION-11.2 gives a table's cell paragraphs the lines it lays them out on", () => {
    const pages = engine();
    const cell = (value: string) =>
      type('table_cell').create(null, [type('paragraph').create(null, text(value))]);
    const words = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk';
    const row = type('table_row').create(null, [cell(words), cell('b')]);
    const caption = type('table_caption').create(null, text('Table'));
    const table = type('table').create(null, [row]);
    const figure = type('table_figure').create(null, [caption, table]);
    const lines = pages.nestedLines(figure, null);
    const paragraphs: ProseMirrorNode[] = [];
    figure.descendants((node) => {
      if (node.type.name === 'paragraph') paragraphs.push(node);
      return true;
    });
    expect(paragraphs.map((node) => lines.has(node))).toEqual([true, true]);
    // Laid out in its cell's width, which is narrower than the page's.
    const [wide] = paragraphs;
    if (!wide) throw new Error('no paragraph');
    const own = pages.lines(wide, { scope: null });
    expect(lines.get(wide)?.lines.length).toBeGreaterThan(own?.lines.length ?? 0);
    expect(pages.nestedLines(figure, null)).toBe(lines);
    // None for a container the engine cannot lay out, such as a table figure with no caption.
    const bare = type('table_figure').create(null, [table]);
    expect(pages.nestedLines(bare, null).size).toBe(0);
    pages.destroy();
  });

  it("DOCE-PAGINATION-11.2 lays a container's captions out with the labels the pages show", () => {
    const pages = engine();
    const cell = type('table_cell').create(null, [type('paragraph').create(null, text('b'))]);
    const table = type('table').create(null, [type('table_row').create(null, [cell])]);
    const caption = type('table_caption').create(null, text('Table'));
    const figure = type('table_figure').create(null, [caption, table]);
    const bare = pages.nestedLines(figure, null).get(caption)?.lines[0]?.width ?? 0;
    const labelOf = (node: ProseMirrorNode) => (node === caption ? 'Table 9 - ' : undefined);
    const labelled = pages.nestedLines(figure, null, labelOf);
    expect(labelled.get(caption)?.lines[0]?.width).toBeGreaterThan(bare);
    expect(pages.nestedLines(figure, null, labelOf)).toBe(labelled);
    pages.destroy();
  });

  it("DOCE-PAGINATION-11.2 gives a layout section's column paragraphs the lines it lays them out on", () => {
    const pages = engine();
    const words = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk llll mmmm';
    const column = (value: string) =>
      type('layout_column').create(null, [type('paragraph').create(null, text(value))]);
    const item = type('list_item').create(null, [type('paragraph').create(null, text('b'))]);
    const list = type('bullet_list').create(null, [item]);
    const listed = type('layout_column').create(null, [list]);
    const section = type('layout_section').create({ preset: 'thirds' }, [
      column(words),
      listed,
      column(words),
    ]);
    const lines = pages.nestedLines(section, null);
    const paragraphs: ProseMirrorNode[] = [];
    section.descendants((node) => {
      if (node.type.name === 'paragraph') paragraphs.push(node);
      return true;
    });
    // A list's item paragraph in a column too.
    expect(paragraphs.map((node) => lines.has(node))).toEqual([true, true, true]);
    // Laid out in its column's width, a third of the page's less the gaps.
    const [first] = paragraphs;
    if (!first) throw new Error('no paragraph');
    const drawn = lines.get(first);
    const own = pages.lines(first, { scope: null });
    expect(drawn?.width).toBeLessThan((own?.width ?? 0) / 3);
    expect(drawn?.lines.length).toBeGreaterThan(own?.lines.length ?? 0);
    expect(pages.nestedLines(section, null)).toBe(lines);
    pages.destroy();
  });

  it('DOCE-PAGINATION-11.10 gives a footnote area the shape measured footnotes take', () => {
    const pages = engine();
    const entry = (id: string) =>
      type('footnote_entry').create({ footnoteId: id }, text(`Note ${id}`));
    const area = type('page_footnotes').create(null, [entry('a'), entry('b')]);
    const room = pages.measureRegion(area, null);
    if (!room) throw new Error('no room');
    const [first, second] = room.children;
    if (!first || !second) throw new Error('no entries');
    const measured = footnoteAreaOf(area, room);
    expect(measured.entries.get('a')).toBeCloseTo(second.top - first.top);
    expect(measured.last?.get('b')).toBeCloseTo(second.bottom - second.top);
    expect(measured.overhead).toBeCloseTo(room.height - (second.bottom - first.top));
    expect(footnoteAreaHeight(measured, ['a', 'b'])).toBeCloseTo(room.height);
    pages.destroy();
  });
});

// Served fonts as a host's would be, measured with the fake canvas.
function served(added: string[] = []): ServedFonts {
  return {
    phase: 'pretext',
    measureContext: () => new OffscreenCanvas(1, 1).getContext('2d') as unknown as MeasureContext,
    isFontServed: () => true,
    generics: {},
    reserve: () => null,
    files: () => ({ faces: [] }),
    drawnFamily: (family) => family,
    missing: () => undefined,
    drawnFiles: () => ({ faces: [] }),
    add: (families) => {
      added.push(...families);
      return Promise.resolve(families.includes('Lab Serif'));
    },
    destroy: () => undefined,
  };
}

describe('holdTextEngine', () => {
  it('DOCE-PAGINATION-9.7 lays the pages out in the language they are drawn in, and again when it changes', async () => {
    const host = document.createElement('section');
    const measureIn = host.appendChild(document.createElement('div'));
    host.lang = 'zh-Hans';
    const holder = holdTextEngine({
      setting: { template: () => BASE_TEMPLATE, fonts: Promise.resolve(served()) },
      measureIn,
      changed: () => undefined,
    });
    await holder.loaded;
    const first = holder.engine();
    expect(first).not.toBeNull();
    expect(holder.engine()).toBe(first);
    host.lang = 'ja';
    const second = holder.engine();
    expect(second).not.toBe(first);
    host.removeAttribute('lang');
    expect(holder.engine()).not.toBe(second);
    holder.destroy();
  });

  it('DOCE-PAGINATION-11.12 keeps the engine in another markup, its lines moved', async () => {
    let markup: 'all' | 'final' | 'original' = 'all';
    const holder = holdTextEngine({
      setting: {
        template: () => BASE_TEMPLATE,
        fonts: Promise.resolve(served()),
        markup: () => markup,
      },
      measureIn: document.createElement('div'),
      changed: () => undefined,
    });
    await holder.loaded;
    const engine = holder.engine();
    const version = holder.version();
    markup = 'final';
    expect(holder.engine()).toBe(engine);
    expect(holder.version()).toBe(version + 1);
    expect(holder.engine()).toBe(engine);
    expect(holder.version()).toBe(version + 1);
    holder.destroy();
  });

  it('DOCE-PAGINATION-11.1 loads the engine on first use and makes it again for another template', async () => {
    let template = BASE_TEMPLATE;
    const holder = holdTextEngine({
      setting: { template: () => template, fonts: Promise.resolve(served()) },
      measureIn: document.createElement('div'),
      changed: () => undefined,
    });
    expect(holder.engine()).toBeNull();
    await holder.loaded;
    const first = holder.engine();
    expect(first?.template).toBe(BASE_TEMPLATE);
    expect(holder.engine()).toBe(first);
    const version = holder.version();
    template = { ...BASE_TEMPLATE };
    expect(holder.engine()).not.toBe(first);
    expect(holder.version()).toBe(version + 1);
    holder.destroy();
    expect(holder.engine()).toBeNull();
  });

  it('DOCE-HOST-1.14.1 makes no engine without served fonts, and asks for a new family', async () => {
    const browser = holdTextEngine({
      setting: {
        template: () => BASE_TEMPLATE,
        fonts: Promise.resolve({ phase: 'browser', reason: 'no-shaper' }),
      },
      measureIn: document.createElement('div'),
      changed: () => undefined,
    });
    await browser.loaded;
    expect(browser.engine()).toBeNull();
    const added: string[] = [];
    const changed = vi.fn();
    const paragraphStyle = { font: 'Lab Serif' };
    const template = { ...BASE_TEMPLATE, textStyles: { paragraph: paragraphStyle } };
    const holder = holdTextEngine({
      setting: {
        template: () => template as typeof BASE_TEMPLATE,
        fonts: Promise.resolve(served(added)),
      },
      measureIn: document.createElement('div'),
      changed,
    });
    await holder.loaded;
    const first = holder.engine();
    expect(added).toContain('Lab Serif');
    await vi.waitFor(() => {
      expect(changed).toHaveBeenCalled();
    });
    expect(holder.engine()).not.toBe(first);
    holder.destroy();
  });

  it('DOCE-PAGINATION-5.6 DOCE-PAGINATION-12.5 makes the engine again once when faces load, then settles', async () => {
    const fonts = new EventTarget();
    Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });
    try {
      let changes = 0;
      const holder = holdTextEngine({
        setting: { template: () => BASE_TEMPLATE, fonts: Promise.resolve(served()) },
        measureIn: document.createElement('div'),
        changed: () => {
          changes += 1;
        },
      });
      await holder.loaded;
      const first = holder.engine();
      const version = holder.version();
      fonts.dispatchEvent(new Event('loadingdone'));
      expect(changes).toBe(1);
      expect(holder.version()).toBe(version + 1);
      const second = holder.engine();
      expect(second).not.toBe(first);
      expect(second?.measureBlock(paragraph(WORDS), null)?.height).toBeGreaterThan(0);
      holder.destroy();
      fonts.dispatchEvent(new Event('loadingdone'));
      expect(changes).toBe(1);
    } finally {
      Reflect.deleteProperty(document, 'fonts');
    }
  });
  it('DOCE-PAGINATION-9.1 lays a kept node out again with the widths of faces that loaded later', async () => {
    const fonts = new EventTarget();
    Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });
    let scale = 1;
    class WideningContext {
      font = '10px sans-serif';
      letterSpacing = '0px';
      textRendering = 'auto';
      fontKerning = 'auto';
      measureText(text: string) {
        const size = Number(/(\d+(?:\.\d+)?)px/u.exec(this.font)?.[1] ?? 16);
        return { width: [...text].length * (size / 2) * scale };
      }
    }
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return new WideningContext();
        }
      },
    );
    try {
      const holder = holdTextEngine({
        setting: { template: () => BASE_TEMPLATE, fonts: Promise.resolve(served()) },
        measureIn: document.createElement('div'),
        changed: () => undefined,
      });
      await holder.loaded;
      const node = paragraph(WORDS);
      const before = holder.engine()?.measureBlock(node, null)?.height ?? 0;
      // A wider face loads: the remade engine prepares the same node again, at its widths.
      scale = 2;
      fonts.dispatchEvent(new Event('loadingdone'));
      const after = holder.engine()?.measureBlock(node, null)?.height ?? 0;
      expect(before).toBeGreaterThan(0);
      expect(after).toBeGreaterThan(before);
      holder.destroy();
    } finally {
      Reflect.deleteProperty(document, 'fonts');
    }
  });
});

function engineOf(measureContext?: () => MeasureContext) {
  return createPagesTextEngine({
    template: BASE_TEMPLATE,
    measureIn: document.createElement('div'),
    onAtomsSettled: () => undefined,
    measureContext,
  });
}

// A paragraph's split at two lines, and its fragments' heights as reserved and as laid out alone,
// which is how each fragment is drawn on its page.
function splitAtTwoLines(markup: string) {
  const engine = engineOf();
  const node = paragraph(markup);
  const block = engine.measureBlock(node, null);
  if (!block) throw new Error('not laid out');
  const lines = engine.lines(node, { scope: null })?.lines ?? [];
  const split = splitParagraph(block, (lines[0]?.height ?? 0) * 2 + 0.5);
  if (!split) throw new Error('not split');
  const fragments: LayoutBlock[] = [split.head, ...split.tail];
  const drawn = (fragment: LayoutBlock) => engine.measureBlock(fragment.node, null)?.height;
  const result = {
    node,
    joined: fragments.reduce(
      (content, fragment) => content.append(fragment.node.content),
      fragments[0]?.node.content.cut(0, 0) ?? node.content,
    ),
    reserved: fragments.map((fragment) => fragment.height),
    drawn: fragments.map(drawn),
  };
  engine.destroy();
  return result;
}

describe('split paragraphs on the engine', () => {
  it('DOCE-PAGINATION-11.1 fragments put together give back the paragraph, each reserving the height it draws', () => {
    const split = splitAtTwoLines(`${WORDS} ${WORDS}`);
    expect(split.joined.eq(split.node.content)).toBe(true);
    expect(split.drawn).toEqual(split.reserved);
  });

  it('DOCE-PAGINATION-3.6 DOCE-PAGINATION-11.1 a paragraph of hard breaks split after two lines reserves what each fragment draws', () => {
    const split = splitAtTwoLines('a<br>b<br>c<br>d');
    expect(split.joined.eq(split.node.content)).toBe(true);
    expect(split.drawn).toEqual(split.reserved);
  });
});

// The DOM geometry a layout may read, counted while the engine lays text out.
const GEOMETRY: readonly [object, string][] = [
  [Element.prototype, 'getBoundingClientRect'],
  [Element.prototype, 'getClientRects'],
  [Range.prototype, 'getBoundingClientRect'],
  [Range.prototype, 'getClientRects'],
  [HTMLElement.prototype, 'offsetWidth'],
  [HTMLElement.prototype, 'offsetHeight'],
  [Element.prototype, 'clientWidth'],
  [Element.prototype, 'clientHeight'],
  [window, 'getComputedStyle'],
];

function countGeometryReads(): string[] {
  const reads: string[] = [];
  for (const [owner, name] of GEOMETRY) {
    const descriptor = Object.getOwnPropertyDescriptor(owner, name);
    if (descriptor?.get) {
      vi.spyOn(owner as never, name as never, 'get').mockImplementation(function (this: unknown) {
        reads.push(name);
        return descriptor.get?.call(this) as never;
      });
    } else {
      const original = descriptor?.value as ((...args: unknown[]) => unknown) | undefined;
      Object.defineProperty(owner, name, {
        configurable: true,
        writable: true,
        value(this: unknown, ...args: unknown[]) {
          reads.push(name);
          return original?.apply(this, args) ?? new DOMRect();
        },
      });
      restores.push(() => {
        if (descriptor) Object.defineProperty(owner, name, descriptor);
        else Reflect.deleteProperty(owner, name);
      });
    }
  }
  return reads;
}

const restores: (() => void)[] = [];
afterEach(() => {
  for (const restore of restores.splice(0)) restore();
});

// A width source on which an emoji is wider than its font size, as Canvas measures one in Chromium.
function wideEmojiContext(): MeasureContext {
  const context = {
    font: '10px sans-serif',
    letterSpacing: '0px',
    textRendering: 'geometricPrecision',
    fontKerning: 'auto',
    measureText(text: string) {
      const size = Number(/(\d+(?:\.\d+)?)px/u.exec(context.font)?.[1] ?? 16);
      let width = 0;
      for (const character of text) {
        if (/\p{Extended_Pictographic}/u.test(character)) width += size * 2;
        else width += character === ' ' ? size / 4 : size / 2;
      }
      return { width };
    },
  };
  return context as unknown as MeasureContext;
}

const TEXT_BLOCKS =
  '<h1>Title 😀</h1><p>Emoji 😀😀😀 👩‍👩‍👧 café <strong>bold</strong> <em>leaning</em> <code>code</code> and words that wrap the line, again and again and again and again.</p>';

describe('prediction reads no DOM', () => {
  // Since fork release 1.0.0-fe.6, Pretext measures emoji from the width source alone once a
  // measure context is set, and reads no span's box (outside review, row 11).
  it('DOCE-PAGINATION-11.1 lays text out, emoji included, without reading any DOM geometry', () => {
    const engine = engineOf(wideEmojiContext);
    const reads = countGeometryReads();
    parseMarkup(TEXT_BLOCKS).forEach((node: ProseMirrorNode) => {
      engine.lines(node, { scope: null });
      engine.measureBlock(node, null);
    });
    engine.destroy();
    expect(reads).toEqual([]);
  });
});
