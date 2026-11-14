import { undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { EditorState, Plugin, TextSelection, type Transaction } from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  canonicalState,
  edit,
  mount,
  pageCount,
  positionOf,
  textOf,
  TEXTS,
} from '../../test/projection-fixtures.js';
import { joinDocumentPages, sameStructure } from '../model/index.js';
import { REMEASURE_EVENT } from '../utils/remeasure.js';
import { canonicalView } from './canonical-view.js';
import { type MeasuringViewOptions, mountMeasuringView } from './ghost-view.js';
import { layoutNow } from './layout-latency.js';
import { isPaginationTransaction, layoutStats, pageMetrics } from './layout-marks.js';
import { pageMap } from './page-map.js';

// Whether the projection's pages join into the canonical document.
const inSync = ({ view, state }: { view: { state: EditorState }; state: EditorState }) =>
  sameStructure(joinDocumentPages(view.state.doc).doc, state.doc);

afterEach(() => {
  document.body.replaceChildren();
});

describe('projection view', () => {
  it('DOCE-PAGINATION-7.10 shows the canonical state on pages, which join into it', () => {
    const { projection } = mount();
    expect(pageCount(projection.state.doc)).toBe(1);
    expect(pageCount(projection.view.state.doc)).toBe(3);
    expect(inSync(projection)).toBe(true);
    expect(projection.stats()).toMatchObject({ layouts: 1, refused: 0, relaid: 0 });
  });

  it('DOCE-PAGINATION-7.17 measures in the ghost the host mounts, shown each document it lays out', () => {
    const shown: EditorState[] = [];
    const destroyed = vi.fn();
    const mountGhost = vi.fn((element: HTMLElement, options: MeasuringViewOptions) => {
      const ghost = mountMeasuringView(element, options);
      return {
        view: ghost.view,
        show: (state: EditorState) => {
          shown.push(state);
          ghost.show(state);
        },
        destroy: () => {
          destroyed();
          ghost.destroy();
        },
      };
    });
    const { projection, drain } = mount({ mountGhost });
    expect(mountGhost).toHaveBeenCalledOnce();
    const at = positionOf(projection.view.state.doc, 'Alpha');
    projection.view.dispatch(projection.view.state.tr.insertText('New ', at));
    drain();
    expect(shown.at(-1)?.doc.eq(projection.state.doc)).toBe(true);
    expect(pageCount(projection.view.state.doc)).toBe(3);
    projection.destroy();
    expect(destroyed).toHaveBeenCalledOnce();
  });

  it('DOCE-PAGINATION-7.10 refuses a change to the pages that is not an edit of the canonical state', () => {
    const { projection } = mount();
    const { doc } = projection.view.state;
    const before = projection.state;
    // From the end of the first page's content to the start of the second's: the pages joined.
    const firstPage = doc.child(0).child(0);
    const contentEnd = 1 + 1 + firstPage.child(0).nodeSize + firstPage.child(1).nodeSize - 1;
    const secondContent = 1 + firstPage.nodeSize + 1 + firstPage.child(0).nodeSize + 1;
    const join = projection.view.state.tr.step(
      new ReplaceStep(contentEnd, secondContent, doc.slice(0, 0)),
    );
    projection.view.dispatch(join);
    expect(projection.view.state.doc).toBe(doc);
    expect(projection.state).toBe(before);
    expect(projection.stats().refused).toBe(1);
  });

  it('DOCE-PAGINATION-7.11 routes an edit made on the pages to the canonical state', () => {
    const sent: Transaction[] = [];
    const { projection, drain } = mount({ dispatch: (tr) => sent.push(tr) });
    const { view } = projection;
    const at = positionOf(view.state.doc, 'Gamma');
    view.dispatch(view.state.tr.insertText('New ', at));
    expect(sent).toHaveLength(1);
    expect(textOf(projection.state.doc)).toContain('New Gamma three');
    expect(textOf(view.state.doc)).toContain('New Gamma three');
    expect(inSync(projection)).toBe(true);
    drain();
    expect(projection.stats()).toMatchObject({ layouts: 2, refused: 0, relaid: 0 });
    expect(inSync(projection)).toBe(true);
  });

  it('DOCE-PAGINATION-7.18 gives the layout of the canonical state through the projection map', () => {
    const { projection, drain } = mount();
    const { view } = projection;
    const before = projection.state;
    expect(pageMap(before).canonical).toBe(projection.map.canonical);
    view.dispatch(view.state.tr.insertText('New ', positionOf(view.state.doc, 'Epsilon')));
    const typed = pageMap(projection.state);
    expect(typed.projection).toBe(view.state.doc);
    expect(typed.canonical).toBe(projection.map.canonical);
    expect(typed.pageAt(positionOf(projection.state.doc, 'New Epsilon'))?.number).toBe(3);
    expect(pageMap(before).projection).not.toBe(view.state.doc);
    drain();
    expect(pageMap(projection.state).canonical).toBe(projection.map.canonical);
    expect(pageMap(projection.state).pageAt(positionOf(projection.state.doc, 'Beta'))?.number).toBe(
      1,
    );
  });

  it('DOCE-PAGINATION-7.11 shows on the pages what the canonical plugins append to input', () => {
    // Appends a full stop after each edit that does not end with one.
    const stop = new Plugin({
      appendTransaction(transactions, _before, after) {
        if (!transactions.some((tr) => tr.docChanged) || after.doc.textContent.endsWith('.'))
          return null;
        return after.tr.insertText('.', positionOf(after.doc, 'five') + 'five'.length);
      },
    });
    const { projection } = mount({ state: canonicalState([stop]) });
    const { view } = projection;
    view.dispatch(view.state.tr.insertText('New ', positionOf(view.state.doc, 'Gamma')));
    expect(textOf(projection.state.doc)).toMatch(/New Gamma three.*five\.$/);
    expect(textOf(view.state.doc)).toBe(textOf(projection.state.doc));
    expect(inSync(projection)).toBe(true);
    projection.run((state, dispatch) => {
      dispatch?.(state.tr.insertText('!', positionOf(state.doc, 'Alpha')));
      return true;
    });
    expect(textOf(view.state.doc)).toBe(textOf(projection.state.doc));
    expect(inSync(projection)).toBe(true);
    expect(projection.stats()).toMatchObject({ refused: 0, relaid: 0 });
  });

  it('DOCE-PAGINATION-7.11 runs keys and commands on the canonical state, with the selection mirrored', () => {
    const { projection } = mount({ keys: { 'Mod-z': undo } });
    const { view } = projection;
    const at = positionOf(view.state.doc, 'Delta') + 'Delta'.length;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
    const { selection } = projection.state;
    expect(projection.state.doc.textBetween(selection.from - 5, selection.from)).toBe('Delta');
    projection.run((state, dispatch) => {
      dispatch?.(state.tr.insertText('!'));
      return true;
    });
    expect(textOf(view.state.doc)).toContain('Delta! four');
    expect(inSync(projection)).toBe(true);
    projection.run(undo);
    expect(textOf(view.state.doc)).not.toContain('!');
    expect(inSync(projection)).toBe(true);
  });

  it('DOCE-PAGINATION-7.12 mirrors a canonical state made elsewhere, by its steps or by the difference', () => {
    const { projection } = mount();
    const { state } = projection;
    const tr = state.tr.insertText('Remote ', positionOf(state.doc, 'Epsilon'));
    projection.update(state.apply(tr), tr);
    expect(textOf(projection.view.state.doc)).toContain('Remote Epsilon');
    expect(inSync(projection)).toBe(true);
    const replaced = projection.state.apply(
      projection.state.tr.delete(
        positionOf(projection.state.doc, 'Beta'),
        positionOf(projection.state.doc, 'Beta') + 4,
      ),
    );
    projection.update(replaced);
    expect(textOf(projection.view.state.doc)).not.toContain('Beta');
    expect(inSync(projection)).toBe(true);
    expect(projection.stats().relaid).toBe(0);
  });

  it('DOCE-PAGINATION-7.12 lays the pages out again when a change cannot be placed on pages that no longer join into the document', () => {
    // A footnote entry no marker cites is left off the pages, so they do not join into the
    // document, and the change that removes it maps outside them.
    const plain = canonicalState();
    const area = positionOf(plain.doc, 'Epsilon') + 'Epsilon five'.length + 3;
    const orphan = documentSchema.node('footnote_entry', null, [documentSchema.text('Orphan')]);
    const state = plain.apply(plain.tr.insert(area, orphan));
    const { projection } = mount({ state });
    expect(inSync(projection)).toBe(false);
    const tr = state.tr.delete(area, area + orphan.nodeSize);
    expect(() => projection.update(state.apply(tr), tr)).not.toThrow();
    expect(inSync(projection)).toBe(true);
    expect(projection.stats().relaid).toBe(1);
  });

  it('DOCE-PAGINATION-7.12 keeps a selection the browser shows over a later state that changes only the selection', () => {
    const { projection } = mount();
    const { view } = projection;
    const click = projection.state.apply(
      projection.state.tr.setSelection(
        TextSelection.create(projection.state.doc, positionOf(projection.state.doc, 'Beta')),
      ),
    );
    // The browser holds a range the keys made after the click, which the view reads on a flush.
    const from = positionOf(view.state.doc, 'Delta');
    const observer = (view as unknown as { domObserver: { flush(): void } }).domObserver;
    const flush = vi.spyOn(observer, 'flush').mockImplementationOnce(() => {
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, from, from + 5)),
      );
    });
    projection.update(click);
    const selected = ({ doc, selection }: EditorState) =>
      doc.textBetween(selection.from, selection.to);
    expect(selected(view.state)).toBe('Delta');
    expect(selected(projection.state)).toBe('Delta');
    // With nothing newer in the browser, the state's selection is drawn.
    projection.update(click);
    expect(view.state.selection.from).toBe(
      projection.map.toProjection(positionOf(click.doc, 'Beta')),
    );
    flush.mockRestore();
  });

  it('DOCE-PAGINATION-7.12 lands a host jump while the browser selection is outside the pages or already read', () => {
    const { projection } = mount();
    const { view } = projection;
    const jumpTo = (text: string) =>
      projection.state.apply(
        projection.state.tr
          .setSelection(
            TextSelection.create(projection.state.doc, positionOf(projection.state.doc, text)),
          )
          .scrollIntoView(),
      );
    const caret = (text: string) =>
      projection.map.toProjection(positionOf(projection.state.doc, text));
    // Focus in a find field outside the pages, as when picking a result or an outline entry.
    const field = document.body.appendChild(document.createElement('input'));
    field.focus();
    projection.update(jumpTo('Delta'));
    expect(view.state.selection.from).toBe(caret('Delta'));
    expect(projection.state.selection.from).toBe(positionOf(projection.state.doc, 'Delta'));
    // Focus back in the pages, with the browser's caret read already: the next jump lands too.
    view.focus();
    projection.update(jumpTo('Beta'));
    expect(view.state.selection.from).toBe(caret('Beta'));
    expect(projection.state.selection.from).toBe(positionOf(projection.state.doc, 'Beta'));
    field.remove();
  });

  it('DOCE-PAGINATION-7.12 takes back the state the host made from its own transaction without mirroring it again', () => {
    const sent: Transaction[] = [];
    const { projection } = mount({ dispatch: (tr) => sent.push(tr) });
    const { view } = projection;
    view.dispatch(view.state.tr.insertText('Typed ', positionOf(view.state.doc, 'Alpha')));
    const shown = view.state.doc;
    const [tr] = sent;
    if (!tr) throw new Error('no transaction');
    projection.update(canonicalStateAfter(projection.state, tr), tr);
    expect(view.state.doc).toBe(shown);
    expect(inSync(projection)).toBe(true);
  });

  it("DOCE-PAGINATION-7.13 draws the canonical plugins' decorations on the pages, across a break", () => {
    const { projection } = mount({ state: canonicalState([highlight('two', 'Gamma')]) });
    const { view } = projection;
    expect(pageCount(view.state.doc)).toBe(3);
    expect(marked(view.dom)).toBe('two|Gamma');
    const { state } = projection;
    const tr = state.tr.insertText('Big ', positionOf(state.doc, 'two'));
    projection.update(state.apply(tr), tr);
    expect(marked(view.dom)).toBe('two|Gamma');
  });

  it('DOCE-PAGINATION-7.13 draws the same decorations again while the sets and the pages are unchanged', () => {
    const { projection } = mount({
      state: canonicalState([steadyHighlight('two', 'Gamma'), steadyHighlight('Alpha', 'Alpha')]),
    });
    const { view } = projection;
    // The set of the canonical decorations: the one drawing the highlights.
    const drawn = () => {
      let found: DecorationSet | null = null;
      view.someProp('decorations', (decorations) => {
        const set = decorations.call(view, view.state);
        if (set instanceof DecorationSet && set.find().length === 2) found = set;
      });
      return found;
    };
    const before = drawn();
    expect(before).not.toBeNull();
    const at = positionOf(view.state.doc, 'Gamma');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
    expect(drawn()).toBe(before);
    expect(marked(view.dom)).toBe('Alpha|two|Gamma');
  });

  it('DOCE-PAGINATION-8.5 hides the header and footer a section repeats on its later pages', () => {
    const { projection } = mount();
    const { view } = projection;
    expect(pageCount(view.state.doc)).toBe(3);
    const hidden = [...view.dom.querySelectorAll('.pm-page')].map((page) =>
      [...page.querySelectorAll(':scope > .pm-page-header, :scope > .pm-page-footer')].map(
        (region) => region.getAttribute('aria-hidden'),
      ),
    );
    expect(hidden).toEqual([
      [null, null],
      ['true', 'true'],
      ['true', 'true'],
    ]);
  });

  it("DOCE-PAGINATION-7.14 gives the chrome the pages' view as a view of the canonical state", () => {
    const sent: Transaction[] = [];
    const { projection } = mount();
    const canonical = canonicalView(projection.view, {
      canonical: () => projection.state,
      map: () => projection.map,
      dispatch: (tr) => sent.push(tr),
    });
    expect(canonical.state).toBe(projection.state);
    expect(canonical.dom).toBe(projection.view.dom);
    const at = positionOf(projection.state.doc, 'Gamma');
    const { node, offset } = canonical.domAtPos(at);
    expect(node.textContent?.slice(offset)).toBe('Gamma three');
    expect(canonical.posAtDOM(node, offset)).toBe(at);
    expect(canonical.nodeDOM(at - 1)?.textContent).toBe('Gamma three');
    canonical.dispatch(canonical.state.tr.insertText('!', at));
    expect(sent).toHaveLength(1);
    expect(sent[0]?.before).toBe(projection.state.doc);
  });

  it("DOCE-PAGINATION-7.15 runs the canonical plugins' views, keys and text input on the canonical state", () => {
    const seen: EditorState[] = [];
    const watcher = new Plugin({
      view: (view) => {
        seen.push(view.state);
        return { update: (updated) => seen.push(updated.state) };
      },
    });
    const keys = keymap({
      'Ctrl-q': (state, dispatch) => {
        dispatch?.(state.tr.insertText('Q'));
        return true;
      },
    });
    const arrows = new Plugin({
      props: {
        handleTextInput(view, from, to, text) {
          if (text !== '>') return false;
          view.dispatch(view.state.tr.insertText('→', from, to));
          return true;
        },
      },
    });
    const { projection } = mount({ state: canonicalState([watcher, keys, arrows]) });
    const { view } = projection;
    expect(seen).toEqual([projection.state]);
    const at = positionOf(view.state.doc, 'Delta') + 'Delta'.length;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
    const press = new KeyboardEvent('keydown', { key: 'q', ctrlKey: true });
    expect(view.someProp('handleKeyDown', (handle) => handle(view, press))).toBe(true);
    expect(textOf(view.state.doc)).toContain('DeltaQ four');
    const typedAt = view.state.selection.from;
    const typed = view.someProp('handleTextInput', (handle) =>
      handle(view, typedAt, typedAt, '>', () => view.state.tr.insertText('>', typedAt)),
    );
    expect(typed).toBe(true);
    expect(textOf(projection.state.doc)).toContain('DeltaQ→ four');
    expect(textOf(view.state.doc)).toContain('DeltaQ→ four');
    expect(inSync(projection)).toBe(true);
    expect(seen.at(-1)).toBe(projection.state);
  });

  it('DOCE-PAGINATION-7.19 offers typed text to the canonical plugins without reading the browser again', () => {
    const offered: number[] = [];
    const listening = new Plugin({
      props: {
        handleTextInput(view, from) {
          offered.push(from - view.state.selection.from);
          return false;
        },
      },
    });
    const { projection } = mount({ state: canonicalState([listening]) });
    const { view } = projection;
    const at = positionOf(view.state.doc, 'Delta') + 'Delta'.length;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
    const observer = (view as unknown as { domObserver: { flush(): void } }).domObserver;
    const flush = vi.spyOn(observer, 'flush');
    const typed = view.someProp('handleTextInput', (handle) =>
      handle(view, at, at, 'x', () => view.state.tr.insertText('x', at)),
    );
    expect(typed).toBeFalsy();
    expect(flush).not.toHaveBeenCalled();
    // The canonical state had the selection the pages hold mirrored before the plugin read it.
    expect(offered).toEqual([0]);
    flush.mockRestore();
  });

  it('DOCE-PAGINATION-7.15 draws the node views of plugins the canonical state gains', () => {
    const { projection } = mount();
    const drawn = new Plugin({
      props: {
        nodeViews: {
          paragraph: () => {
            const dom = document.createElement('p');
            dom.className = 'drawn';
            return { dom, contentDOM: dom };
          },
        },
      },
    });
    const { state } = projection;
    projection.update(state.reconfigure({ plugins: [...state.plugins, drawn] }));
    expect(projection.view.dom.querySelectorAll('p.drawn')).toHaveLength(TEXTS.length);
    expect(inSync(projection)).toBe(true);
  });

  it('DOCE-PAGINATION-7.15 hands the canonical plugins double clicks and what is pasted', () => {
    const clicked: EditorState[] = [];
    const clipboard = new Plugin({
      props: {
        transformPastedHTML: (html) => html.replace('raw', 'clean'),
        handleDOMEvents: {
          dblclick: (view) => {
            clicked.push(view.state);
            return true;
          },
        },
      },
    });
    const { projection } = mount({ state: canonicalState([clipboard]) });
    const { view } = projection;
    let html = '<p>raw</p>';
    view.someProp('transformPastedHTML', (transform) => {
      html = transform(html, view);
    });
    expect(html).toBe('<p>clean</p>');
    view.dom.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(clicked).toEqual([projection.state]);
  });

  it('DOCE-PAGINATION-7.16 tells how its layouts go', async () => {
    const laid: Transaction[] = [];
    const states: string[] = [];
    const { projection, drain } = mount({
      onLayout: (tr) => laid.push(tr),
      onLayoutStateChange: (state) => states.push(state),
    });
    expect(projection.layoutState()).toBe('pending');
    drain();
    expect(projection.layoutState()).toBe('settled');
    await expect(projection.whenSettled()).resolves.toBe('settled');
    const [first] = laid;
    if (!first) throw new Error('no layout');
    expect(isPaginationTransaction(first)).toBe(true);
    expect(layoutStats(first)).toMatchObject({ layouts: 1, pagesRebuilt: 3 });
    expect(pageMetrics(projection.view.state)).toHaveLength(3);
    projection.refresh({ remeasure: true });
    expect(projection.layoutState()).toBe('pending');
    drain();
    expect(laid).toHaveLength(2);
    expect(projection.stats()).toMatchObject({ layouts: 2, pagesReused: 3, refused: 0 });
    expect(states).toEqual(['settled', 'pending', 'settled']);
  });

  it('DOCE-PAGINATION-7.17 waits for its fonts, and counts the pages it shows as the layout of the canonical state', async () => {
    let loaded: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      loaded = resolve;
    });
    const { projection, drain } = mount({ ready });
    drain();
    expect(projection.layoutState()).toBe('pending');
    loaded();
    await ready;
    drain();
    expect(projection.layoutState()).toBe('settled');
    expect(pageMap(projection.state).pages()).toHaveLength(3);
    expect(projection.stats()).toMatchObject({ layouts: 2 });
  });
});

describe('projection layouts', () => {
  it('DOCE-PAGINATION-7.5 counts layouts, measured and cached blocks, sections and pages', () => {
    const { projection, drain } = mount();
    // The first layout runs while the projection is made.
    const first = projection.stats();
    expect(first).toMatchObject({
      layouts: 1,
      blocksMeasured: 5,
      cacheHits: 0,
      cacheMisses: 5,
      sectionsRelaid: 1,
      sectionsReused: 0,
      pagesLaidOut: 3,
      overflowPages: 0,
    });
    edit(projection, (state) => state.tr.insertText('First ', positionOf(state.doc, 'Alpha')));
    drain();
    expect(projection.stats()).toMatchObject({
      layouts: 2,
      blocksMeasured: 6,
      cacheHits: 4,
      cacheMisses: 6,
      sectionsRelaid: 2,
      sectionsReused: 0,
      overflowPages: 0,
    });
    expect(projection.stats().pagesReused + projection.stats().pagesRebuilt).toBeGreaterThan(
      first.pagesReused + first.pagesRebuilt,
    );
  });

  it('DOCE-PAGINATION-5.7 lays out on the next frame after a change of structure, but settles typing', () => {
    const { projection, drain } = mount({ settle: 150 });
    expect(projection.stats().layouts).toBe(1);
    edit(projection, (state) => state.tr.insertText('Typed ', positionOf(state.doc, 'Alpha')));
    drain();
    expect(projection.stats().layouts).toBe(1);
    edit(projection, (state) => state.tr.split(positionOf(state.doc, 'one')));
    drain();
    expect(projection.stats().layouts).toBe(2);
    edit(projection, (state) => layoutNow(state.tr.insertText('x', positionOf(state.doc, 'Beta'))));
    drain();
    expect(projection.stats().layouts).toBe(3);
  });

  it('DOCE-PAGINATION-5.9 measures again once after a change when a page overflows', () => {
    // The test DOM draws pages with no height, so a page of two paragraphs overflows.
    const { projection, drain } = mount(
      { state: canonicalState([], ['One', 'Two']) },
      { height: 100, boxes: true },
    );
    drain();
    expect(projection.stats()).toMatchObject({ layouts: 2, blocksMeasured: 4, overflowPages: 2 });
    expect(projection.layoutState()).toBe('settled');
    edit(projection, (state) => state.tr.insertText('First ', positionOf(state.doc, 'One')));
    drain();
    expect(projection.stats()).toMatchObject({ layouts: 4, overflowPages: 4 });
  });

  it('DOCE-PAGINATION-7.6 settles two frames after a layout with none due, and pends on a change', async () => {
    const states: string[] = [];
    const { projection, next, drain } = mount({
      onLayoutStateChange: (state) => states.push(state),
    });
    expect(projection.layoutState()).toBe('pending');
    const settled = projection.whenSettled();
    next();
    expect(projection.layoutState()).toBe('pending');
    next();
    expect(projection.layoutState()).toBe('settled');
    await expect(settled).resolves.toBe('settled');

    edit(projection, (state) => state.tr.insertText('First ', positionOf(state.doc, 'Alpha')));
    expect(projection.layoutState()).toBe('pending');
    next();
    // A change before the pages settle starts the wait over.
    edit(projection, (state) => state.tr.insertText('Then ', positionOf(state.doc, 'Alpha')));
    drain();
    expect(projection.layoutState()).toBe('settled');
    expect(states).toEqual(['settled', 'pending', 'settled']);
  });

  it('DOCE-PAGINATION-7.6 fails when a layout throws, and lays out again when asked', async () => {
    let broken = false;
    const { projection, drain } = mount({
      pageHeight: () => {
        if (broken) throw new Error('No page height');
        return 1000;
      },
    });
    drain();
    broken = true;
    projection.refresh();
    expect(() => drain()).toThrow('No page height');
    expect(projection.layoutState()).toBe('failed');
    await expect(projection.whenSettled()).resolves.toBe('failed');
    broken = false;
    projection.refresh();
    drain();
    expect(projection.layoutState()).toBe('settled');
  });

  it('DOCE-PAGINATION-7.6 fails when layouts keep moving the pages with no change in between', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((run) => {
      run(0);
      return 0;
    });
    let calls = 0;
    // Every other layout fits two paragraphs on a page, so each moves the pages again.
    const measureIn = document.body.appendChild(document.createElement('div'));
    const { projection, drain } = mount(
      {
        measureIn,
        state: canonicalState([], ['One', 'Two', 'Three', 'Four']),
        pageHeight: () => {
          calls += 1;
          return calls % 2 ? 150 : 250;
        },
      },
      { height: 100 },
    );
    drain();
    for (let index = 0; index < 10; index += 1) {
      measureIn.dispatchEvent(new Event(REMEASURE_EVENT));
      drain();
    }
    expect(projection.layoutState()).toBe('failed');
    const { layouts } = projection.stats();
    edit(projection, (state) => state.tr.insertText('First ', positionOf(state.doc, 'One')));
    drain();
    expect(projection.stats().layouts).toBe(layouts + 1);
    expect(projection.layoutState()).toBe('settled');
  });
});

// A canonical plugin that marks the text from one string to the end of another.
function highlight(from: string, to: string): Plugin {
  return new Plugin({
    props: {
      decorations: (state) =>
        DecorationSet.create(state.doc, [
          Decoration.inline(positionOf(state.doc, from), positionOf(state.doc, to) + to.length, {
            class: 'found',
          }),
        ]),
    },
  });
}

// A highlight kept in the plugin's state, the same set until the document changes.
function steadyHighlight(from: string, to: string): Plugin<DecorationSet> {
  const plugin: Plugin<DecorationSet> = new Plugin<DecorationSet>({
    state: {
      init: (_config, state) =>
        DecorationSet.create(state.doc, [
          Decoration.inline(positionOf(state.doc, from), positionOf(state.doc, to) + to.length, {
            class: 'found',
          }),
        ]),
      apply: (tr, set) => set.map(tr.mapping, tr.doc),
    },
    props: { decorations: (state) => plugin.getState(state) },
  });
  return plugin;
}

const marked = (dom: HTMLElement) =>
  [...dom.querySelectorAll('.found')].map((node) => node.textContent).join('|');

// The host's own state after a transaction it received: the same document.
function canonicalStateAfter(state: EditorState, tr: Transaction): EditorState {
  return EditorState.create({ doc: tr.doc, selection: tr.selection, plugins: state.plugins });
}
