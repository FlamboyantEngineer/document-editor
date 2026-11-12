import { history, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, Plugin, TextSelection, type Transaction } from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { joinDocumentPages, readDocumentFile, sameStructure } from '../model/index.js';
import { canonicalView } from './canonical-view.js';
import { isPaginationTransaction, layoutStats, pageMetrics } from './pagination.js';
import { createProjectionView, type ProjectionViewOptions } from './projection-view.js';

const PARAGRAPH_HEIGHT = 400;
const TEXTS = ['Alpha one', 'Beta two', 'Gamma three', 'Delta four', 'Epsilon five'];

// The test DOM lays nothing out: ranges measure as empty, and each paragraph is 400 pixels tall,
// so pages 1,000 pixels tall hold two paragraphs each.
function stubLayout() {
  Object.assign(Range.prototype, {
    getBoundingClientRect: () => new DOMRect(),
    getClientRects: (): DOMRect[] => [],
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return new DOMRect(0, 0, 100, this.tagName === 'P' ? PARAGRAPH_HEIGHT : 0);
  });
}

function canonicalState(plugins: readonly Plugin[] = []): EditorState {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          content: TEXTS.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
        },
      ],
    },
    documentSchema,
  ).doc;
  return EditorState.create({ doc, plugins: [history(), ...plugins] });
}

function mount(options: Partial<ProjectionViewOptions> = {}) {
  stubLayout();
  const queue: (() => void)[] = [];
  const projection = createProjectionView({
    mount: document.body.appendChild(document.createElement('div')),
    measureIn: document.body.appendChild(document.createElement('div')),
    state: canonicalState(),
    pageHeight: 1000,
    settle: 0,
    schedule: (run) => {
      queue.push(run);
      return () => queue.splice(queue.indexOf(run), 1);
    },
    ...options,
  });
  const drain = () => {
    while (queue.length) queue.shift()?.();
  };
  return { projection, drain };
}

const pageCount = (doc: ProseMirrorNode) => doc.child(0).childCount;
const textOf = (doc: ProseMirrorNode) => doc.textContent;

// The position just before some text.
function positionOf(doc: ProseMirrorNode, text: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found >= 0 || !node.isText) return found < 0;
    const index = node.text?.indexOf(text) ?? -1;
    if (index >= 0) found = pos + index;
    return false;
  });
  if (found < 0) throw new Error(text);
  return found;
}

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

  it('DOCE-PAGINATION-7.16 tells how its layouts go, as a pagination does', async () => {
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

const marked = (dom: HTMLElement) =>
  [...dom.querySelectorAll('.found')].map((node) => node.textContent).join('|');

// The host's own state after a transaction it received: the same document.
function canonicalStateAfter(state: EditorState, tr: Transaction): EditorState {
  return EditorState.create({ doc: tr.doc, selection: tr.selection, plugins: state.plugins });
}
