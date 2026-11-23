// The measuring view drawn at one device pixel per CSS pixel on every screen. Chromium rounds a
// font's ascent and descent, borders and line boxes to device pixels, so a block the browser sizes
// measures differently at each device pixel ratio. Zoomed by the inverse of the ratio, the view
// lays out as on a screen of ratio 1, and its sizes, divided by that zoom, are the same everywhere.

/** The property the measuring element publishes for its zoom, the inverse of the pixel ratio. */
export const MEASURE_ZOOM_PROPERTY = '--de-measure-zoom';

/**
 * The zoom the browser draws an element at, its ancestors' included, which what is measured in it
 * is divided by: 1 where the browser cannot tell.
 */
export function measuredZoom(element: HTMLElement): number {
  const zoom = (element as HTMLElement & { readonly currentCSSZoom?: number }).currentCSSZoom;
  return typeof zoom === 'number' && zoom > 0 ? zoom : 1;
}

// Chromium's layout unit, 1/64 of a CSS pixel, which a size measured at ratio 1 is a multiple of.
const LAYOUT_UNIT = 64;

/**
 * A length measured in a view drawn at `zoom`, divided by it and snapped to Chromium's layout unit,
 * so the floating-point remainder of dividing by an inexact zoom (1/1.25, 1/3) is not kept: the
 * same size on every screen.
 */
export function unzoom(length: number, zoom: number): number {
  return Math.round((length / zoom) * LAYOUT_UNIT) / LAYOUT_UNIT;
}

/**
 * Publishes the inverse of the measuring element's device pixel ratio as `--de-measure-zoom`, which
 * the reference stylesheet zooms it by, and tells `changed` when the ratio changes, as when the
 * window moves to another screen; returns what stops it. Measurements divide by the zoom the
 * browser applies (`measuredZoom`), so a host stylesheet without the zoom still measures right, at
 * its screen's ratio.
 */
export function holdMeasureScale(measureIn: HTMLElement, changed: () => void): () => void {
  const view = measureIn.ownerDocument.defaultView;
  let query: MediaQueryList | null = null;
  const follow = () => {
    const ratio = view?.devicePixelRatio && view.devicePixelRatio > 0 ? view.devicePixelRatio : 1;
    measureIn.style.setProperty(MEASURE_ZOOM_PROPERTY, String(1 / ratio));
    query?.removeEventListener('change', onChange);
    query = view?.matchMedia?.(`(resolution: ${String(ratio)}dppx)`) ?? null;
    query?.addEventListener('change', onChange);
  };
  function onChange() {
    follow();
    changed();
  }
  follow();
  return () => {
    query?.removeEventListener('change', onChange);
    measureIn.style.removeProperty(MEASURE_ZOOM_PROPERTY);
  };
}
