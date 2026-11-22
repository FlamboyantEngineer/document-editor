// The bitmap size of a page painted into a canvas (DOCE-EDITOR-1.9): the browser's exact
// device-pixel box of the canvas, so the page is drawn once per screen pixel and never resampled.

/** A canvas's backing size, in device pixels. */
interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

interface ObservedSize extends CanvasSize {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly ratio: number;
}

/** Follows a page's CSS size onto its canvas and the canvas's device-pixel size. */
interface CanvasSizeObserver {
  /** The backing size to paint at now. */
  read(): CanvasSize;
  disconnect(): void;
}

// The device-pixel box from the canvas's edges, each rounded as the browser snaps it: rounding the
// width up instead can add a pixel that blurs the whole page.
function snappedSize(rect: DOMRect, ratio: number): CanvasSize {
  return {
    width: Math.round(rect.right * ratio) - Math.round(rect.left * ratio),
    height: Math.round(rect.bottom * ratio) - Math.round(rect.top * ratio),
  };
}

/**
 * Sizes `canvas` to `page`'s border box (as `--de-canvas-width` and `--de-canvas-height`) and keeps
 * its device-pixel size, calling `repaint` whenever either changes.
 */
export function observeCanvasSize(
  page: HTMLElement,
  canvas: HTMLCanvasElement,
  repaint: () => void,
): CanvasSizeObserver {
  const win = page.ownerDocument.defaultView;
  let observed: ObservedSize | null = null;
  const readCanvas = (entry: ResizeObserverEntry) => {
    const size = entry.devicePixelContentBoxSize?.[0];
    const rect = canvas.getBoundingClientRect();
    observed = size
      ? {
          width: size.inlineSize,
          height: size.blockSize,
          cssWidth: rect.width,
          cssHeight: rect.height,
          ratio: win?.devicePixelRatio ?? 1,
        }
      : null;
  };
  const observer = win?.ResizeObserver
    ? new win.ResizeObserver((entries) => {
        for (const entry of entries) {
          const size = entry.borderBoxSize[0];
          if (entry.target !== page) readCanvas(entry);
          else if (size) {
            canvas.style.setProperty('--de-canvas-width', `${String(size.inlineSize)}px`);
            canvas.style.setProperty('--de-canvas-height', `${String(size.blockSize)}px`);
          }
        }
        repaint();
      })
    : null;
  observer?.observe(page, { box: 'border-box' });
  const physical =
    win?.ResizeObserverEntry && 'devicePixelContentBoxSize' in win.ResizeObserverEntry.prototype;
  observer?.observe(canvas, { box: physical ? 'device-pixel-content-box' : 'content-box' });
  return {
    read() {
      const rect = canvas.getBoundingClientRect();
      const ratio = win?.devicePixelRatio ?? 1;
      // A transform or an emulated ratio can leave the observer's box behind the drawn one.
      const current =
        observed?.ratio === ratio &&
        observed.cssWidth === rect.width &&
        observed.cssHeight === rect.height &&
        Math.abs(observed.width - rect.width * ratio) <= 1 &&
        Math.abs(observed.height - rect.height * ratio) <= 1;
      return current && observed ? observed : snappedSize(rect, ratio);
    },
    disconnect: () => observer?.disconnect(),
  };
}
