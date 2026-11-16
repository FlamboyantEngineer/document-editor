interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

interface ObservedSize extends CanvasSize {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly dpr: number;
}

interface CanvasSizeObserver {
  read(): CanvasSize;
  disconnect(): void;
}

/** Keeps the bitmap on the browser's physical pixel grid, including CSS zoom and edge snapping. */
export function observeCanvasSize(
  page: HTMLElement,
  canvas: HTMLCanvasElement,
  repaint: () => void,
): CanvasSizeObserver {
  const win = page.ownerDocument.defaultView;
  let observed: ObservedSize | null = null;
  const observer = win?.ResizeObserver
    ? new win.ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === page) {
            const size = entry.borderBoxSize[0];
            if (!size) continue;
            canvas.style.setProperty('--de-canvas-width', `${String(size.inlineSize)}px`);
            canvas.style.setProperty('--de-canvas-height', `${String(size.blockSize)}px`);
          } else {
            const size = entry.devicePixelContentBoxSize?.[0];
            const rect = canvas.getBoundingClientRect();
            observed = size
              ? {
                  width: size.inlineSize,
                  height: size.blockSize,
                  cssWidth: rect.width,
                  cssHeight: rect.height,
                  dpr: win.devicePixelRatio,
                }
              : null;
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
    read(): CanvasSize {
      const rect = canvas.getBoundingClientRect();
      const dpr = win?.devicePixelRatio ?? 1;
      // Transforms and emulated DPR can disagree with the observer's untransformed device box.
      if (
        observed?.dpr === dpr &&
        observed.cssWidth === rect.width &&
        observed.cssHeight === rect.height &&
        Math.abs(observed.width - rect.width * dpr) <= 1 &&
        Math.abs(observed.height - rect.height * dpr) <= 1
      )
        return observed;
      // Round both edges: ceil(width * DPR) can add a pixel that gets blurred away on display.
      return {
        width: Math.round(rect.right * dpr) - Math.round(rect.left * dpr),
        height: Math.round(rect.bottom * dpr) - Math.round(rect.top * dpr),
      };
    },
    disconnect: () => observer?.disconnect(),
  };
}
