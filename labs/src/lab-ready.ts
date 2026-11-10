// When a paginated lab is ready for a test: once its pages are laid out and the views that follow
// the layout, such as a table of contents taking its page numbers, have drawn it. A lab calls
// `pagesLaidOut` after each layout; the page is marked ready once no layout has followed for a
// short while.

/** How long the page stays still after a layout before it counts as ready, in milliseconds. */
const SETTLE = 150;

let latest = 0;

/** Marks the lab ready a short while after its latest layout. */
export function pagesLaidOut(): void {
  latest += 1;
  const layout = latest;
  window.setTimeout(() => {
    if (layout === latest) document.documentElement.dataset.labReady = 'true';
  }, SETTLE);
}
