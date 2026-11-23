// What the layout tells of its pages (`useDocumentLayout`): when they settle, what their layouts
// did, the engine's lines and layout, and the pages laid out in a markup for a moment.

import { type RefObject, useMemo } from 'react';
import type { PagesLayout } from '../../document/pages-layout.js';
import type { FontFiles } from '../../host/font-files.js';
import type { SuggestionMarkup } from '../../layout-engine/hidden-suggestions.js';
import type { LayoutState, PageTextLines, PaginationStats } from '../../pagination/index.js';
import { createAllLines } from './all-lines.js';
import type { LayoutRunner } from './start-paging.js';
import type { PagesFontsState } from './use-pages-fonts.js';

/** What the layout tells of its pages: when they settle, and what their layouts did. */
export interface LayoutProgress {
  /** Resolves with `settled` or `failed` once no layout is pending; at once in the web layout. */
  whenSettled(): Promise<LayoutState>;
  /** What the layouts did since the pages were first laid out; null in the web layout. */
  stats(): PaginationStats | null;
  /** The lines the layout engine drew the pages' text on (`textLayout: 'pretext'`); none else. */
  textLines(): PageTextLines[];
  /** The pages' layout as data (`textLayout: 'pretext'`); null else. */
  pagesLayout(): PagesLayout | null;
  /** Runs `take` with the pages laid out in a markup for that moment (`useLayoutMarkup`). */
  inMarkup<T>(markup: SuggestionMarkup, take: () => T): T;
  /** The served faces the pages are measured and drawn with (`textLayout: 'pretext'`); null else. */
  servedFonts(): FontFiles | null;
  /**
   * The served faces as `servedFonts` gives them, and again under each family the pages draw under
   * another (DOCE-PAGINATION-12.8), for a snapshot of the pages; null without the engine.
   */
  drawnFonts(): FontFiles | null;
  /** With the layout engine, draws every page on its lines, or only those near the screen again. */
  drawAllLines(all: boolean): void;
  /** Draws every page on the engine's lines until the function it returns is called. */
  holdAllLines(): () => void;
}

// What the active pagination tells of its pages; with none, in the web layout, they are settled.
export function useLayoutProgress(
  active: RefObject<LayoutRunner | null>,
  latest: RefObject<{ readonly text: PagesFontsState }>,
  inMarkup: LayoutProgress['inMarkup'],
): LayoutProgress {
  return useMemo(() => {
    const allLines = createAllLines((all) => active.current?.drawAllLines(all));
    return {
      inMarkup,
      whenSettled: () => active.current?.whenSettled() ?? Promise.resolve('settled'),
      stats: () => active.current?.stats() ?? null,
      textLines: () => active.current?.textLines() ?? [],
      pagesLayout: () => active.current?.pagesLayout() ?? null,
      servedFonts: () => active.current?.servedFonts() ?? null,
      drawnFonts: () => (active.current?.servedFonts() ? latest.current.text.drawnFiles() : null),
      drawAllLines: allLines.drawAll,
      holdAllLines: allLines.hold,
    };
  }, [active, latest, inMarkup]);
}
