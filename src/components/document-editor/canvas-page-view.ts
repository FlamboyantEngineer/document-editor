import { DOMSerializer } from 'prosemirror-model';
import type { NodeViewConstructor } from 'prosemirror-view';
import { createHooks } from '../../utils/hooks.js';

/** How the editor paints its pages; HTML-in-Canvas falls back to DOM when unavailable. */
export type DocumentRendering = 'dom' | 'html-canvas';

interface DrawableCanvas extends HTMLCanvasElement {
  content: string;
  requestPaint(): void;
  updateElementGeometry(element: Element): void;
}

interface DrawableContext extends CanvasRenderingContext2D {
  drawElementImage(element: Element, x: number, y: number, width: number, height: number): void;
}

const hooks = createHooks('document-editor', ['canvas-page', 'canvas']);

// Detect the stable API in the view's own document, without allocating a context in DOM mode.
function drawingIn(owner: Document) {
  const canvas = owner.createElement('canvas') as DrawableCanvas;
  canvas.setAttribute('content', 'drawable');
  if (
    canvas.content !== 'drawable' ||
    typeof canvas.requestPaint !== 'function' ||
    typeof canvas.updateElementGeometry !== 'function'
  )
    return null;
  try {
    const context = canvas.getContext('2d') as DrawableContext | null;
    return context && typeof context.drawElementImage === 'function' ? { canvas, context } : null;
  } catch {
    return null;
  }
}

// Observe CSS sizes, viewport visibility, and DPR separately: changing screens need not resize CSS.
function watchPage(page: HTMLElement, canvas: DrawableCanvas, visible: (shown: boolean) => void) {
  const win = page.ownerDocument.defaultView;
  const repaint = () => canvas.requestPaint();
  const observer = win?.ResizeObserver
    ? new win.ResizeObserver(([entry]) => {
        const size = entry?.borderBoxSize[0];
        if (!size) return;
        canvas.style.setProperty('--de-canvas-width', `${String(size.inlineSize)}px`);
        canvas.style.setProperty('--de-canvas-height', `${String(size.blockSize)}px`);
        repaint();
      })
    : null;
  observer?.observe(page);
  const intersection = win?.IntersectionObserver
    ? new win.IntersectionObserver(
        ([entry]) => {
          if (entry) visible(entry.isIntersecting);
        },
        { rootMargin: '100% 0px' },
      )
    : null;
  intersection?.observe(canvas);
  let resolution = win?.matchMedia?.(`(resolution: ${String(win.devicePixelRatio)}dppx)`);
  const changed = () => {
    resolution?.removeEventListener('change', changed);
    resolution = win?.matchMedia?.(`(resolution: ${String(win.devicePixelRatio)}dppx)`);
    resolution?.addEventListener('change', changed);
    repaint();
  };
  resolution?.addEventListener('change', changed);
  win?.addEventListener('resize', repaint);
  return () => {
    observer?.disconnect();
    intersection?.disconnect();
    resolution?.removeEventListener('change', changed);
    win?.removeEventListener('resize', repaint);
  };
}

// Native canvas omits origin-unclean media. Such pages retain their DOM presentation.
function hasExternalMedia(page: HTMLElement): boolean {
  if (page.querySelector('iframe, object, embed, svg image, svg use, picture, img[srcset], video'))
    return true;
  return [...page.querySelectorAll('img')].some((media) => {
    const src = media.getAttribute('src');
    if (!src) return false;
    try {
      const url = new URL(src, page.ownerDocument.baseURI);
      return (
        !['data:', 'blob:'].includes(url.protocol) &&
        url.origin !== page.ownerDocument.location?.origin
      );
    } catch {
      return true;
    }
  });
}

// Every page owns a bitmap, so document length never determines a canvas's maximum dimensions.
function paintPage(page: HTMLElement, drawing: NonNullable<ReturnType<typeof drawingIn>>) {
  const { canvas, context } = drawing;
  const win = page.ownerDocument.defaultView;
  const wrapper = page.ownerDocument.createElement('div');
  wrapper.className = hooks.slot('canvas-page').className ?? '';
  canvas.className = hooks.slot('canvas').className ?? '';
  page.setAttribute('drawable', '');
  canvas.append(page);
  wrapper.append(canvas);
  let stopped = false;
  let visible = true;
  const unwatch = watchPage(page, canvas, (shown) => {
    visible = shown;
    if (visible) canvas.requestPaint();
    else canvas.width = canvas.height = 0;
  });
  const fallback = () => {
    if (stopped) return;
    stopped = true;
    unwatch();
    page.removeAttribute('drawable');
    canvas.replaceWith(page);
    canvas.width = canvas.height = 0;
  };
  const paint = () => {
    if (stopped || !visible) return;
    if (hasExternalMedia(page)) {
      fallback();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const dpr = win?.devicePixelRatio ?? 1;
    const width = Math.ceil(rect.width * dpr);
    const height = Math.ceil(rect.height * dpr);
    if (!width || !height) return;
    if (width > 16384 || height > 16384 || width * height > 67108864) {
      fallback();
      return;
    }
    try {
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      context.reset();
      // Destination dimensions are backing pixels; never multiply pagination's CSS sizes by DPR.
      context.drawElementImage(page, 0, 0, width, height);
      // Keep the real HTML registered for native hit testing and accessibility.
      canvas.updateElementGeometry(page);
    } catch {
      fallback();
    }
  };
  canvas.addEventListener('paint', paint);
  canvas.addEventListener('contextlost', fallback);
  win?.addEventListener('beforeprint', fallback);
  return {
    dom: wrapper,
    destroy() {
      stopped = true;
      unwatch();
      canvas.removeEventListener('paint', paint);
      canvas.removeEventListener('contextlost', fallback);
      win?.removeEventListener('beforeprint', fallback);
      canvas.width = canvas.height = 0;
    },
  };
}

/** A page keeps its real HTML as canvas content, including native editing and accessibility. */
export const canvasPageView: NodeViewConstructor = (node, view) => {
  const owner = view.dom.ownerDocument;
  const spec = node.type.spec.toDOM?.(node);
  if (!spec) throw new Error('A canvas page needs a DOM representation.');
  const { dom, contentDOM } = DOMSerializer.renderSpec(owner, spec);
  if (dom.nodeType !== 1 || !contentDOM) throw new Error('A canvas page needs HTML content.');
  const page = dom as HTMLElement;
  const drawing = drawingIn(owner);
  const painted = drawing ? paintPage(page, drawing) : null;
  return {
    dom: painted?.dom ?? page,
    contentDOM,
    update: (next) => next.sameMarkup(node),
    // Bitmap sizing is presentation, while selection and edits inside the page remain input.
    ignoreMutation: (mutation) =>
      mutation.type !== 'selection' && !contentDOM.contains(mutation.target),
    destroy: () => painted?.destroy(),
  };
};
