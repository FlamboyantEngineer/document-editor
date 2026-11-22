// Pages painted into a canvas (DOCE-EDITOR-1.9): with `rendering: 'html-canvas'`, each page of
// the paged view keeps its real HTML as the content of a canvas, where the browser lays it out,
// edits it, hit-tests it and exposes it to assistive technology, and the HTML-in-Canvas API paints
// it into the canvas's own bitmap at the screen's exact device-pixel size. The page's layout,
// and so its lines (DOCE-PAGINATION-11), is the same as in the DOM; only painting changes. A
// browser without the API, a page the canvas cannot paint, or a failed paint keeps the page in
// the DOM.

import { DOMSerializer } from 'prosemirror-model';
import type { NodeViewConstructor } from 'prosemirror-view';
import { createHooks } from '../../utils/hooks.js';
import { observeCanvasSize } from './canvas-page-size.js';

/** How the paged view paints its pages: as HTML (`dom`), or into a canvas each (`html-canvas`). */
export type DocumentRendering = 'dom' | 'html-canvas';

interface DrawableCanvas extends HTMLCanvasElement {
  requestPaint(): void;
  updateElementGeometry?(element: Element): void;
}

interface DrawableContext extends CanvasRenderingContext2D {
  drawElementImage(element: Element, x: number, y: number, width: number, height: number): void;
}

/** Why a page stays in the DOM under `rendering: 'html-canvas'` (`data-canvas-fallback`). */
type CanvasFallback = 'unsupported' | 'media' | 'size' | 'paint' | 'context-lost';

interface Drawing {
  readonly canvas: DrawableCanvas;
  readonly context: DrawableContext;
}

const hooks = createHooks('document-editor', ['canvas-page', 'canvas']);

/** A canvas this large or larger is refused by the browser; such a page stays in the DOM. */
const MAX_SIDE = 16_384;
const MAX_AREA = 67_108_864;

// The attribute that makes a canvas lay its content out: `content="drawable"` in the API as
// Chromium 156 (behind its switch) and 157 have it, `layoutsubtree` in earlier builds.
const DRAWABLE: readonly (readonly [string, string, (canvas: HTMLCanvasElement) => boolean])[] = [
  ['content', 'drawable', (canvas) => (canvas as { content?: string }).content === 'drawable'],
  ['layoutsubtree', '', (canvas) => (canvas as { layoutSubtree?: boolean }).layoutSubtree === true],
];

// A canvas that can paint its content in the view's document, or null where the API is missing.
function drawingIn(owner: Document): Drawing | null {
  const canvas = owner.createElement('canvas') as DrawableCanvas;
  const drawable = DRAWABLE.find(([name, value, reflects]) => {
    canvas.setAttribute(name, value);
    if (reflects(canvas)) return true;
    canvas.removeAttribute(name);
    return false;
  });
  if (!drawable || typeof canvas.requestPaint !== 'function') return null;
  try {
    const context = canvas.getContext('2d') as DrawableContext | null;
    return context && typeof context.drawElementImage === 'function' ? { canvas, context } : null;
  } catch {
    return null;
  }
}

// Whether a page holds media the canvas would leave out (cross-origin or embedded documents).
function hasForeignMedia(page: HTMLElement): boolean {
  if (page.querySelector('iframe, object, embed, svg image, svg use, picture, img[srcset], video'))
    return true;
  return [...page.querySelectorAll('img')].some((media) => {
    const src = media.getAttribute('src');
    if (!src) return false;
    try {
      const url = new URL(src, page.ownerDocument.baseURI);
      const own = url.origin === page.ownerDocument.location?.origin;
      return !own && !['data:', 'blob:'].includes(url.protocol);
    } catch {
      return true;
    }
  });
}

// Repaints when the page's size, the canvas's device pixels or the screen's ratio change, and
// tells whether the canvas is near the screen; a far canvas gives its bitmap back.
function watchPage(page: HTMLElement, drawing: Drawing, visible: (shown: boolean) => void) {
  const { canvas } = drawing;
  const win = page.ownerDocument.defaultView;
  const repaint = () => canvas.requestPaint();
  const size = observeCanvasSize(page, canvas, repaint);
  const near = win?.IntersectionObserver
    ? new win.IntersectionObserver(
        ([entry]) => {
          if (entry) visible(entry.isIntersecting);
        },
        { rootMargin: '100% 0px' },
      )
    : null;
  near?.observe(canvas);
  let resolution: MediaQueryList | undefined;
  const ratioChanged = () => {
    resolution?.removeEventListener('change', ratioChanged);
    resolution = win?.matchMedia?.(`(resolution: ${String(win.devicePixelRatio)}dppx)`);
    resolution?.addEventListener('change', ratioChanged);
    repaint();
  };
  resolution = win?.matchMedia?.(`(resolution: ${String(win.devicePixelRatio)}dppx)`);
  resolution?.addEventListener('change', ratioChanged);
  return {
    size: size.read,
    disconnect() {
      size.disconnect();
      near?.disconnect();
      resolution?.removeEventListener('change', ratioChanged);
    },
  };
}

// Paints one page into its canvas on every paint the browser asks for, falling back to the DOM
// for good when the canvas cannot hold or paint the page.
function paintPage(page: HTMLElement, drawing: Drawing) {
  const { canvas, context } = drawing;
  const wrapper = page.ownerDocument.createElement('div');
  wrapper.className = hooks.slot('canvas-page').className ?? '';
  canvas.className = hooks.slot('canvas').className ?? '';
  canvas.append(page);
  wrapper.append(canvas);
  let stopped = false;
  let visible = true;
  const watcher = watchPage(page, drawing, (shown) => {
    visible = shown;
    if (visible) canvas.requestPaint();
    else canvas.width = canvas.height = 0;
  });
  const stop = () => {
    stopped = true;
    watcher.disconnect();
    canvas.width = canvas.height = 0;
  };
  const fallback = (reason: CanvasFallback) => {
    if (stopped) return;
    stop();
    page.setAttribute('data-canvas-fallback', reason);
    canvas.replaceWith(page);
  };
  const lost = () => fallback('context-lost');
  const paint = () => {
    if (stopped || !visible) return;
    const { width, height } = watcher.size();
    if (!width || !height) return;
    if (hasForeignMedia(page)) return fallback('media');
    if (Math.max(width, height) >= MAX_SIDE || width * height >= MAX_AREA) return fallback('size');
    try {
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      context.reset();
      // The destination is the bitmap's own pixels, so the page is never scaled by the ratio here.
      context.drawElementImage(page, 0, 0, width, height);
      canvas.updateElementGeometry?.(page);
    } catch {
      fallback('paint');
    }
  };
  canvas.addEventListener('paint', paint);
  canvas.addEventListener('contextlost', lost);
  return {
    dom: wrapper,
    destroy() {
      canvas.removeEventListener('paint', paint);
      canvas.removeEventListener('contextlost', lost);
      stop();
    },
  };
}

/** A page node view that paints the page into a canvas, its HTML kept as the canvas's content. */
export const canvasPageView: NodeViewConstructor = (node, view) => {
  const owner = view.dom.ownerDocument;
  const spec = node.type.spec.toDOM?.(node);
  if (!spec) throw new Error('A canvas page needs a DOM representation.');
  const { dom, contentDOM } = DOMSerializer.renderSpec(owner, spec);
  if (dom.nodeType !== 1 || !contentDOM) throw new Error('A canvas page needs HTML content.');
  const page = dom as HTMLElement;
  const drawing = drawingIn(owner);
  const painted = drawing ? paintPage(page, drawing) : null;
  if (!painted) page.setAttribute('data-canvas-fallback', 'unsupported' satisfies CanvasFallback);
  return {
    dom: painted?.dom ?? page,
    contentDOM,
    update: (next) => next.sameMarkup(node),
    // The canvas's size and bitmap are painting; edits and selections in the page are input.
    ignoreMutation: (mutation) =>
      mutation.type === 'attributes'
        ? !contentDOM.contains(mutation.target) || mutation.target === page
        : mutation.type !== 'selection' && !contentDOM.contains(mutation.target),
    destroy: () => painted?.destroy(),
  };
};
