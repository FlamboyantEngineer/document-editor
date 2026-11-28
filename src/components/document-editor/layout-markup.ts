// The markup the pages are laid out in (DOCE-PAGINATION-11.12): the editor's own, its simple markup
// laid out as if accepted, as it shows the text; or, for a moment, the one a snapshot or a layout
// handed over asks for.

import { type RefObject, useEffect, useMemo, useRef } from 'react';
import type { SuggestionMarkup } from '../../layout-engine/hidden-suggestions.js';
import type { DocumentMarkup } from './editor-context.js';
import type { LayoutRunner } from './start-paging.js';

// How the layout engine lays out suggestions for an editor's markup.
function layoutMarkup(markup: DocumentMarkup | undefined): SuggestionMarkup {
  return markup === 'simple' ? 'final' : (markup ?? 'all');
}

// Lays the pages out now, with the markup the layout engine reads now.
function layOutNow(runner: LayoutRunner): boolean {
  runner.refresh();
  const before = runner.projection;
  runner.layout();
  return runner.projection !== before;
}

/**
 * The markup the pages are laid out in now (`now`), and how to take something of the pages laid
 * out in another (`inMarkup`): the pages are laid out in it, `take` runs, and they are laid out in
 * the editor's markup again, all at once, so the screen never shows the other markup. Another
 * markup on the editor lays the pages out again.
 */
export function useLayoutMarkup(
  markup: DocumentMarkup | undefined,
  latest: RefObject<{ readonly markup?: DocumentMarkup | undefined }>,
  active: RefObject<LayoutRunner | null>,
) {
  const taken = useRef<{ markup: SuggestionMarkup; available: boolean } | null>(null);
  const shown = layoutMarkup(markup);
  const laid = useRef(shown);
  useEffect(() => {
    if (laid.current === shown) return;
    laid.current = shown;
    active.current?.refresh();
  }, [shown, active]);
  return useMemo(() => {
    const editors = () => layoutMarkup(latest.current.markup);
    return {
      now: () => taken.current?.markup ?? editors(),
      inMarkup<T>(wanted: SuggestionMarkup, take: (available: boolean) => T): T {
        const runner = active.current;
        const current = taken.current;
        if (current) return take(current.markup === wanted && current.available);
        if (!runner || wanted === editors()) return take(true);
        const temporary = { markup: wanted, available: false };
        taken.current = temporary;
        try {
          temporary.available = layOutNow(runner) && active.current === runner;
          return take(temporary.available);
        } finally {
          taken.current = null;
          if (active.current === runner) layOutNow(runner);
        }
      },
    };
  }, [latest, active]);
}
