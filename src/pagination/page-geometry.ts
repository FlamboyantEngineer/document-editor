// Where a view drew a paged document's pages: each page's element, and its box relative to the
// view, in unscaled CSS pixels, so a host can scroll to a page, draw beside one or tell which page
// a point is on.

import type { EditorView } from 'prosemirror-view';

/** A page's box as a view drew it, relative to the top left of the view's element. */
export interface PageBox {
  /** Its index among the document's pages, from 0, as `PageMap.pages()` lists them. */
  readonly index: number;
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

/** The element of each page of the paged document a view shows, in order; null for one not drawn. */
export function pageElements(view: EditorView): (HTMLElement | null)[] {
  const elements: (HTMLElement | null)[] = [];
  view.state.doc.forEach((section, offset) => {
    if (section.type.name !== 'page_section') return;
    section.forEach((page, pageOffset) => {
      if (page.type.name !== 'page') return;
      const dom = view.nodeDOM(offset + 1 + pageOffset);
      elements.push(dom && dom.nodeType === 1 ? (dom as HTMLElement) : null);
    });
  });
  return elements;
}

/** Each drawn page's box in a view, divided by the view's on-screen `scale`. */
export function pageBoxes(
  view: EditorView,
  { scale = 1 }: { scale?: number | undefined } = {},
): PageBox[] {
  const ratio = scale > 0 ? scale : 1;
  const origin = view.dom.getBoundingClientRect();
  const boxes: PageBox[] = [];
  pageElements(view).forEach((element, index) => {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    boxes.push({
      index,
      top: (rect.top - origin.top) / ratio,
      left: (rect.left - origin.left) / ratio,
      width: rect.width / ratio,
      height: rect.height / ratio,
    });
  });
  return boxes;
}

/**
 * The index of the page a point on screen (client coordinates) falls on, or of the nearest page
 * above it, as in the gap between two pages; null above the first page or with none drawn.
 */
export function pageAtPoint(view: EditorView, point: { readonly y: number }): number | null {
  let found: number | null = null;
  pageElements(view).forEach((element, index) => {
    if (element && element.getBoundingClientRect().top <= point.y) found = index;
  });
  return found;
}
