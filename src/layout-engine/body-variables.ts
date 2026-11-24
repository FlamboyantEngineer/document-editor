// The template variables of a page's body text as the engine lays them out (DOCE-PAGINATION-11.13).
// A variable whose value is the same on every page, such as a document's title, is laid out as the
// text it shows. One whose value is its page's own, the page's number or the page count, would
// make a block's height depend on the page it lands on, so it takes a box of a fixed width: room
// for as many of its font's zeros as the page count has digits, at least three, which the pages
// draw its number in, right-aligned (`pageBoxWidth`). This module measures nothing, so the pages'
// main bundle can read it without the engine.

/** What the template variables of a page's body text show, for the engine to lay them out. */
export interface BodyVariables {
  /** The text a variable whose value is the same on every page shows; empty for none. */
  readonly text: (key: string) => string;
  /** The digits a page's number or the page count keeps room for. */
  readonly digits: () => number;
}

/** The variables whose value is their page's own: its number and the page count. */
export const PAGE_VARIABLES: ReadonlySet<string> = new Set(['page.current', 'page.total']);
