// The pages' atom measurer: an atom measured as the pages draw it. The view that measures the pages
// draws every node with the host's node views and the plugins that render, such as typeset math,
// template blocks and signatures, in its section's scope and its block's font and marks; the
// measurer reads the atom's box there, and an inline atom's baseline from a copy drawn on a line
// of its own in copies of its ancestors, out of sight. An atom the view still draws,
// such as math not yet typeset or an image that loads, has a provisional size; its final one is
// read when the view says it changed (`de-remeasure`) or its images load (DOCE-PAGINATION-10.2).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import type { AtomMeasure, AtomMeasurer, AtomSize } from '../layout-engine/atoms.js';
import { REMEASURE_EVENT } from '../utils/remeasure.js';
import { margins } from './measure-cache.js';

/** Where the pages' atoms are measured. */
interface DrawnAtomMeasurerOptions {
  /** The view that measures the pages, which draws the nodes the engine lays out. */
  readonly view: () => EditorView | null;
  /** Where the copies are drawn: out of sight, styled as the measuring view is. */
  readonly host: HTMLElement;
  /** How much the measuring view is scaled on screen; boxes are divided by it. */
  readonly scale?: (() => number) | undefined;
}

// How often an atom still drawn is checked for having left the view, in milliseconds, and how many
// checks it is waited for at most, as an image out of sight that loads lazily may never load.
const LEFT_CHECK_MS = 1000;
const MOST_CHECKS = 10;

// Each document's atoms by node, found once per document.
const positions = new WeakMap<ProseMirrorNode, Map<ProseMirrorNode, number>>();

function positionsIn(doc: ProseMirrorNode): Map<ProseMirrorNode, number> {
  let found = positions.get(doc);
  if (!found) {
    const made = new Map<ProseMirrorNode, number>();
    doc.descendants((node, pos) => {
      if (node.isText) return false;
      if (node.isAtom || node.isLeaf || node.type.name === 'figure') made.set(node, pos);
      return !node.isAtom;
    });
    positions.set(doc, made);
    found = made;
  }
  return found;
}

// The element a node is drawn as in the view, found by the node itself.
function drawnElement(view: EditorView, node: ProseMirrorNode): HTMLElement | null {
  const pos = positionsIn(view.state.doc).get(node);
  if (pos === undefined) return null;
  const dom = view.nodeDOM(pos);
  if (!dom || dom.nodeType !== 1) return null;
  return dom as HTMLElement;
}

// A copy of an element, without the ids a page holds once.
function copy(element: Element, deep: boolean): HTMLElement {
  const made = element.cloneNode(deep) as HTMLElement;
  made.removeAttribute('id');
  if (deep) for (const inner of made.querySelectorAll('[id]')) inner.removeAttribute('id');
  return made;
}

// Copies of an element's ancestors up to the view's own element, outermost first: the scope,
// font and marks the element inherits. Returns the outermost copy and the innermost.
function ancestorCopies(element: HTMLElement, root: HTMLElement) {
  const chain: Element[] = [];
  for (let at = element.parentElement; at; at = at.parentElement) {
    chain.unshift(at);
    if (at === root) break;
  }
  let outer: HTMLElement | null = null;
  let inner: HTMLElement | null = null;
  for (const ancestor of chain) {
    const made = copy(ancestor, false);
    if (inner) inner.append(made);
    else outer = made;
    inner = made;
  }
  return { outer, inner };
}

// A figure's caption as the view draws it.
function captionOf(view: EditorView, node: ProseMirrorNode): HTMLElement | null {
  if (node.type.name !== 'figure' || !node.firstChild) return null;
  const pos = positionsIn(view.state.doc).get(node);
  const caption = pos === undefined ? null : view.nodeDOM(pos + 1);
  return caption?.nodeType === 1 ? (caption as HTMLElement) : null;
}

function stillLoading(element: HTMLElement): HTMLImageElement[] {
  const images = [...element.querySelectorAll('img')];
  if (element.tagName === 'IMG') images.unshift(element as HTMLImageElement);
  return images.filter((image) => !image.complete);
}

const loaded = (image: HTMLImageElement) =>
  new Promise<void>((resolve) => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => resolve(), { once: true });
  });

function isPending(element: HTMLElement): boolean {
  return (
    element.matches("[data-state='pending']") ||
    Boolean(element.querySelector("[data-state='pending']"))
  );
}

// What reading an atom's box takes: the view, where copies are drawn and the zoom drawn at.
interface Reading {
  readonly viewOf: () => EditorView | null;
  readonly host: HTMLElement;
  readonly ratio: () => number;
}

// A block atom's box as the view draws it, at the width it is drawn in; a figure's without its
// caption, which the engine lays out as text.
function readBlock(
  { ratio }: Reading,
  { view, node, drawn }: { view: EditorView; node: ProseMirrorNode; drawn: HTMLElement },
): AtomSize {
  const box = drawn.getBoundingClientRect();
  const caption = captionOf(view, node);
  const height = box.height - (caption?.getBoundingClientRect().height ?? 0);
  // Computed margins are not scaled by the zoom, as the box is.
  const { marginTop, marginBottom } = margins(drawn);
  return {
    width: box.width / ratio(),
    height: Math.max(0, height) / ratio(),
    margins: { top: marginTop, bottom: marginBottom },
  };
}

// An inline atom's box as the view draws it, and its baseline from a copy drawn in a copy of
// its ancestors on a line of its own, beside an empty image whose bottom sits on the baseline:
// the copy's depth below the baseline is the atom's. An atom the view drew across lines is read
// from the copy. A copy whose images have not loaded or failed yet, as the drawn ones have, is
// read again once they have (`later`).
function readInline(
  { host, ratio }: Reading,
  { view, drawn }: { view: EditorView; drawn: HTMLElement },
): { size: AtomSize; later: Promise<AtomSize> | null } {
  const documentOf = host.ownerDocument;
  const made = copy(drawn, true);
  const { outer, inner } = ancestorCopies(drawn, view.dom);
  const frame = documentOf.createElement('div');
  const probe = documentOf.createElement('img');
  probe.setAttribute('alt', '');
  probe.setAttribute('width', '0');
  probe.setAttribute('height', '0');
  frame.style.width = 'max-content';
  frame.append(made, probe);
  if (inner) inner.append(frame);
  const shown = outer ?? frame;
  host.append(shown);
  const sizeNow = (): AtomSize => {
    const copied = made.getBoundingClientRect();
    const depth = copied.bottom - probe.getBoundingClientRect().bottom;
    const align = documentOf.defaultView?.getComputedStyle(made).verticalAlign;
    const box = drawn.getClientRects().length === 1 ? drawn.getBoundingClientRect() : copied;
    return {
      width: box.width / ratio(),
      height: box.height / ratio(),
      baseline: (box.height - depth) / ratio(),
      ...(align === 'top' || align === 'bottom' ? { align } : {}),
    };
  };
  const size = sizeNow();
  const copying = stillLoading(made);
  if (!copying.length) {
    shown.remove();
    return { size, later: null };
  }
  const later = Promise.all(copying.map(loaded)).then(() => {
    const final = sizeNow();
    shown.remove();
    return final;
  });
  return { size, later };
}

// The final size of an atom the view still draws: read again once the view says it changed or
// its images load; none if it leaves the view first, so it is measured again when asked.
function settle(
  reading: Reading,
  { node, drawn }: { node: ProseMirrorNode; drawn: HTMLElement },
): Promise<AtomSize | null> {
  return new Promise<AtomSize | null>((resolve) => {
    const window = reading.host.ownerDocument.defaultView;
    const images = stillLoading(drawn);
    let waiting = images.length + (isPending(drawn) ? 1 : 0);
    let check = 0;
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      drawn.removeEventListener(REMEASURE_EVENT, changed);
      window?.clearInterval(check);
      const view = reading.viewOf();
      if (!view || !drawn.isConnected) resolve(null);
      else if (!node.isInline) resolve(readBlock(reading, { view, node, drawn }));
      else {
        const { size, later } = readInline(reading, { view, drawn });
        resolve(later ?? size);
      }
    };
    const step = () => {
      waiting -= 1;
      if (waiting <= 0) done();
    };
    const changed = () => {
      if (!isPending(drawn)) {
        waiting = images.filter((image) => !image.complete).length;
        if (waiting === 0) done();
      }
    };
    drawn.addEventListener(REMEASURE_EVENT, changed);
    for (const image of images) {
      image.addEventListener('load', step, { once: true });
      image.addEventListener('error', step, { once: true });
    }
    let checks = 0;
    check =
      window?.setInterval(() => {
        checks += 1;
        if (!drawn.isConnected || checks >= MOST_CHECKS) done();
      }, LEFT_CHECK_MS) ?? 0;
  });
}

/** Creates the measurer that reads each atom's box as the pages' measuring view draws it. */
export function createDrawnAtomMeasurer({
  view: viewOf,
  host,
  scale = () => 1,
}: DrawnAtomMeasurerOptions): AtomMeasurer {
  const reading: Reading = { viewOf, host, ratio: () => (scale() > 0 ? scale() : 1) };
  return (node): AtomMeasure | null => {
    const view = reading.viewOf();
    const drawn = view ? drawnElement(view, node) : null;
    if (!view || !drawn) return null;
    const still = isPending(drawn) || stillLoading(drawn).length > 0;
    if (!node.isInline) {
      const size = readBlock(reading, { view, node, drawn });
      return still ? { size, settled: settle(reading, { node, drawn }) } : { size };
    }
    const { size, later } = readInline(reading, { view, drawn });
    if (still) return { size, settled: settle(reading, { node, drawn }) };
    return later ? { size, settled: later } : { size };
  };
}
