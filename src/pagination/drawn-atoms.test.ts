import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView, type NodeView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema, findNode, parseMarkup } from '../../test/document-markup.js';
import { createAtomCache } from '../layout-engine/atoms.js';
import { REMEASURE_EVENT } from '../utils/remeasure.js';
import { createDrawnAtomMeasurer } from './drawn-atoms.js';

// Boxes as a stylesheet would draw them: an atom in a heading is three times as wide, and math is
// as wide as its text, which typesetting makes longer.
function stubBoxes() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.tagName === 'IMG') return new DOMRect(0, 0, 0, 12);
    const wide = this.closest('h2') ? 3 : 1;
    return new DOMRect(0, 0, (this.textContent ?? '').length * 6 * wide, 16);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

// A view that measures, drawing math through a node view that typesets it later.
function measuringView(markup: string, typeset?: { later: boolean }) {
  const element = document.createElement('div');
  document.body.append(element);
  const views: HTMLElement[] = [];
  const math = (node: ProseMirrorNode): NodeView => {
    const dom = document.createElement('span');
    dom.dataset.state = typeset?.later ? 'pending' : 'ready';
    dom.textContent = node.textContent;
    views.push(dom);
    return { dom, ignoreMutation: () => true };
  };
  const view = new EditorView(element, {
    state: EditorState.create({ doc: parseMarkup(markup) }),
    editable: () => false,
    nodeViews: { math_inline: math },
  });
  const host = document.createElement('div');
  element.append(host);
  return { view, host, views };
}

describe('createDrawnAtomMeasurer', () => {
  it('DOCE-PAGINATION-10.8 reads an atom as the view draws it, in copies of its ancestors', () => {
    stubBoxes();
    const { view, host } = measuringView(
      '<h2>a <span data-inline-type="latex">x^2</span></h2><p>b <span data-inline-type="latex">x^2</span></p>',
    );
    const measure = createDrawnAtomMeasurer({ view: () => view, host, scale: () => 2 });
    const atoms: ProseMirrorNode[] = [];
    view.state.doc.descendants((node) => {
      if (node.type.name === 'math_inline') atoms.push(node);
    });
    const [inHeading, inParagraph] = atoms;
    if (!inHeading || !inParagraph) throw new Error('no math');
    // Three characters, 6px each, at a zoom of 2; three times as wide in the heading's font.
    expect(measure(inHeading, 0)?.size).toEqual({ width: 27, height: 8, baseline: 6 });
    expect(measure(inParagraph, 0)?.size).toEqual({ width: 9, height: 8, baseline: 6 });
    expect(host.childElementCount).toBe(0);
    // A node the view does not draw is not measured here.
    expect(measure(documentSchema.text('x'), 0)).toBeNull();
    view.destroy();
  });

  it('DOCE-PAGINATION-10.8 reads a block atom’s margins as drawn, its content’s that pass through its edges', () => {
    stubBoxes();
    const element = document.createElement('div');
    document.body.append(element);
    const view = new EditorView(element, {
      state: EditorState.create({ doc: parseMarkup('<div data-dynamic-template="true"></div>') }),
      editable: () => false,
      nodeViews: {
        dynamic_template: () => {
          const dom = document.createElement('div');
          const inner = document.createElement('p');
          inner.style.margin = '5px 0 8px';
          inner.textContent = 'a';
          dom.append(inner);
          return { dom, ignoreMutation: () => true };
        },
      },
    });
    const host = document.createElement('div');
    element.append(host);
    const block = findNode(view.state.doc, 'dynamic_template');
    if (!block) throw new Error('no template block');
    const measure = createDrawnAtomMeasurer({ view: () => view, host, scale: () => 2 });
    expect(measure(block, 600)?.size).toEqual({
      width: 3,
      height: 8,
      margins: { top: 5, bottom: 8 },
    });
    view.destroy();
  });

  it('DOCE-PAGINATION-10.8 keeps a size provisional until the view has drawn the atom', async () => {
    stubBoxes();
    const { view, host, views } = measuringView(
      '<p>b <span data-inline-type="latex">x</span></p>',
      { later: true },
    );
    const cache = createAtomCache({ measure: createDrawnAtomMeasurer({ view: () => view, host }) });
    const listener = vi.fn();
    cache.subscribe(listener);
    const atom = findNode(view.state.doc, 'math_inline');
    const paragraph = findNode(view.state.doc, 'paragraph');
    if (!atom || !paragraph) throw new Error('no math');
    expect(cache.measureAtom(atom, { parent: paragraph })?.width).toBe(6);
    const drawn = views[0];
    if (!drawn) throw new Error('not drawn');
    drawn.textContent = 'xxxx';
    drawn.dataset.state = 'ready';
    drawn.dispatchEvent(new CustomEvent(REMEASURE_EVENT, { bubbles: true }));
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith([atom]));
    expect(cache.measureAtom(atom, { parent: paragraph })?.width).toBe(24);
    view.destroy();
  });

  it('DOCE-PAGINATION-10.8 loads a block atom’s lazy image in the measuring view and reads it once loaded', async () => {
    stubBoxes();
    // The image has not loaded, as one a host previews from its address has not on a first visit.
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(false);
    const element = document.createElement('div');
    document.body.append(element);
    const view = new EditorView(element, {
      state: EditorState.create({ doc: parseMarkup('<div data-dynamic-template="true"></div>') }),
      editable: () => false,
      nodeViews: {
        // Rendered markup that holds an image, as a dynamic template's can.
        dynamic_template: () => {
          const dom = document.createElement('div');
          const image = document.createElement('img');
          image.setAttribute('src', 'plan.png');
          image.setAttribute('loading', 'lazy');
          dom.append(image);
          return { dom, ignoreMutation: () => true };
        },
      },
    });
    const host = document.createElement('div');
    element.append(host);
    const cache = createAtomCache({ measure: createDrawnAtomMeasurer({ view: () => view, host }) });
    const listener = vi.fn();
    cache.subscribe(listener);
    const block = findNode(view.state.doc, 'dynamic_template');
    const image = view.dom.querySelector('img');
    if (!block || !image) throw new Error('no template block');
    expect(cache.measureBlockAtom(block, 400, null)?.provisional).toBe(true);
    // Out of sight, a lazy image never loads, so the measuring view loads it at once.
    expect(image).toHaveAttribute('loading', 'eager');
    image.dispatchEvent(new Event('load'));
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith([block]));
    expect(cache.measureBlockAtom(block, 400, null)?.provisional).toBe(false);
    view.destroy();
  });

  it('DOCE-PAGINATION-10.8 keeps math that typesets slowly provisional for as long as it is drawn', async () => {
    vi.useFakeTimers();
    stubBoxes();
    const { view, host, views } = measuringView(
      '<p>b <span data-inline-type="latex">x</span></p>',
      { later: true },
    );
    const cache = createAtomCache({ measure: createDrawnAtomMeasurer({ view: () => view, host }) });
    const listener = vi.fn();
    cache.subscribe(listener);
    const atom = findNode(view.state.doc, 'math_inline');
    const paragraph = findNode(view.state.doc, 'paragraph');
    const drawn = views[0];
    if (!atom || !paragraph || !drawn) throw new Error('no math');
    expect(cache.measureAtom(atom, { parent: paragraph })?.width).toBe(6);
    // Longer than an image out of sight is waited for: the math is still typesetting.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(listener).not.toHaveBeenCalled();
    expect(cache.pending()).toBe(true);
    drawn.textContent = 'xxxxxxxx';
    drawn.dataset.state = 'ready';
    drawn.dispatchEvent(new CustomEvent(REMEASURE_EVENT, { bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(listener).toHaveBeenCalledWith([atom]);
    expect(cache.pending()).toBe(false);
    expect(cache.measureAtom(atom, { parent: paragraph })?.width).toBe(48);
    vi.useRealTimers();
    view.destroy();
  });

  it('DOCE-PAGINATION-10.8 stops waiting for math removed while it typesets', async () => {
    vi.useFakeTimers();
    stubBoxes();
    const { view, host, views } = measuringView(
      '<p>b <span data-inline-type="latex">x</span></p>',
      { later: true },
    );
    const cache = createAtomCache({ measure: createDrawnAtomMeasurer({ view: () => view, host }) });
    const listener = vi.fn();
    cache.subscribe(listener);
    const atom = findNode(view.state.doc, 'math_inline');
    const paragraph = findNode(view.state.doc, 'paragraph');
    if (!atom || !paragraph || !views[0]) throw new Error('no math');
    cache.measureAtom(atom, { parent: paragraph });
    let at = -1;
    view.state.doc.descendants((node, nodePos) => {
      if (node === atom) at = nodePos;
    });
    view.dispatch(view.state.tr.delete(at, at + atom.nodeSize));
    expect(views[0].isConnected).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(listener).toHaveBeenCalledWith([atom]);
    expect(cache.pending()).toBe(false);
    vi.useRealTimers();
    view.destroy();
  });
});
