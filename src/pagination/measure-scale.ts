// The measuring view drawn at one device pixel per CSS pixel on every screen. Chromium rounds a
// font's ascent and descent, borders and line boxes to device pixels, so a block the browser sizes
// measures differently at each device pixel ratio. Zoomed by the inverse of the ratio, the view
// lays out as on a screen of ratio 1, and its sizes, divided by that zoom, are the same everywhere.

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
 * A margin as Chromium lays it out: a computed style gives the length it resolves (`0.667em` at
 * 14px is 9.333px), and layout keeps it as whole layout units, dropping what is left over
 * (9.328125px), where the layout engine's margins are too (DOCE-PAGINATION-9.2).
 */
export function layoutMargin(length: number): number {
  return Math.trunc(length * LAYOUT_UNIT + Math.sign(length) * 1e-6) / LAYOUT_UNIT;
}
