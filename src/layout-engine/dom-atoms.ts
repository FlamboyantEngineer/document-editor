// The atom cache's measurer in the DOM: an atom is drawn once in a host element that carries the
// document's styles, at the width it is laid out in, and its box read back. An image in it that
// still loads without a fixed box makes the size provisional; the final size is read when the
// images have loaded (DOCE-PAGINATION-10.2).

import { DOMSerializer, type Node as ProseMirrorNode } from 'prosemirror-model';
import type { AtomMeasure, AtomMeasurer, AtomSize } from './atoms.js';

/** Where atoms are drawn to be measured, and how. */
interface DomAtomMeasurerOptions {
  /**
   * The element atoms are drawn in: one the document's stylesheet styles as page content, laid out
   * but out of sight. The measurer adds and removes its own children only.
   */
  readonly host: HTMLElement;
  /** Draws an atom as the document draws it; the schema's own markup by default. */
  readonly render?: ((node: ProseMirrorNode) => HTMLElement | null) | undefined;
}

function serialize(node: ProseMirrorNode): HTMLElement | null {
  const dom = DOMSerializer.fromSchema(node.type.schema).serializeNode(node);
  return dom.nodeType === 1 ? (dom as HTMLElement) : null;
}

function hasFixedBox(image: HTMLImageElement): boolean {
  if (image.getAttribute('width') && image.getAttribute('height')) return true;
  return Boolean(image.style.aspectRatio) || Boolean(image.style.height);
}

function loading(element: HTMLElement): HTMLImageElement[] {
  // The atom may be an image itself, as well as hold some.
  const images = [...element.querySelectorAll('img')];
  if (element.tagName === 'IMG') images.unshift(element as HTMLImageElement);
  return images.filter((image) => {
    // The host sits out of sight, where a lazy image never loads.
    if (image.getAttribute('loading') === 'lazy') image.setAttribute('loading', 'eager');
    return !image.complete && !hasFixedBox(image);
  });
}

const loaded = (image: HTMLImageElement) =>
  new Promise<void>((resolve) => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => resolve(), { once: true });
  });

// A figure's caption as drawn in it, which the engine lays out as text: not part of the atom.
function captionHeight(element: HTMLElement): number {
  if (element.tagName !== 'FIGURE') return 0;
  const slot = element.querySelector(':scope > .doc-figure-caption-slot');
  return slot?.getBoundingClientRect().height ?? 0;
}

/** Creates a measurer that draws each atom in a host element and reads its box. */
export function createDomAtomMeasurer({
  host,
  render = serialize,
}: DomAtomMeasurerOptions): AtomMeasurer {
  const documentOf = host.ownerDocument;

  // A block atom stands in a block of its width; an inline one on a line, beside an empty image,
  // whose bottom edge sits on the baseline.
  const frame = (element: HTMLElement, width: number) => {
    const wrapper = documentOf.createElement('div');
    wrapper.style.width = width > 0 ? `${String(width)}px` : 'max-content';
    if (width > 0) {
      wrapper.append(element);
      return { wrapper, probe: null };
    }
    const line = documentOf.createElement('p');
    const probe = documentOf.createElement('img');
    probe.setAttribute('alt', '');
    probe.setAttribute('width', '0');
    probe.setAttribute('height', '0');
    line.append(element, probe);
    wrapper.append(line);
    return { wrapper, probe };
  };

  const read = (element: HTMLElement, probe: HTMLElement | null): AtomSize => {
    const box = element.getBoundingClientRect();
    if (!probe)
      return { width: box.width, height: Math.max(0, box.height - captionHeight(element)) };
    const baseline = probe.getBoundingClientRect().bottom - box.top;
    return { width: box.width, height: box.height, baseline };
  };

  return (node, width, shown): AtomMeasure | null => {
    const element = render(node);
    if (!element) return null;
    // What a view draws in a leaf atom in place of its own text, such as a footnote number.
    if (shown !== undefined && node.isLeaf) element.textContent = shown;
    const { wrapper, probe } = frame(element, width);
    host.append(wrapper);
    const size = read(element, probe);
    const images = loading(element);
    if (!images.length) {
      wrapper.remove();
      return { size };
    }
    const settled = Promise.all(images.map(loaded)).then(() => {
      const final = read(element, probe);
      wrapper.remove();
      return final;
    });
    return { size, settled };
  };
}
