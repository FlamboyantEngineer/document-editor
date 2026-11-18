// The editor's panels: the side panels an editor holds, by the panes in them, so the editor's handle can reveal a pane
// in whichever panel holds it (`revealPane`), and what the built-in panes draw on from the editor:
// its comments.

import type { SearchPaneHandle } from '@flamboyantengineer/ui-components/search-pane';
import { createContext, useContext, useMemo, useState } from 'react';
import type { DocumentCommentsOptions } from '../document-comments/document-comments.js';

/** How a pane is revealed. */
export interface RevealPaneOptions {
  /** Moves focus into the pane once it shows. Defaults to true. */
  readonly focus?: boolean | undefined;
  /** Called with the pane's element once it shows, in place of moving focus into it. */
  readonly onShown?: ((pane: HTMLElement) => void) | undefined;
}

/** A side panel as the editor knows it: whether it holds a pane, and revealing one. */
interface PaneHolder {
  has(paneId: string): boolean;
  reveal(paneId: string, options: RevealPaneOptions): void;
}

/** Which box of the search pane the find keys focus: the query, or the replacement. */
type SearchPaneBox = 'find' | 'replace';

/** The side panels of one editor, and what its built-in panes draw on. */
export interface EditorPanes {
  /** Adds a panel; the returned function removes it. */
  add(holder: PaneHolder): () => void;
  /** Reveals a pane in the first panel holding it; false when none does. */
  reveal(paneId: string, options?: RevealPaneOptions): boolean;
  /** A search pane drawn, which the find keys move focus into; the returned function removes it. */
  attachSearch(element: HTMLElement, handle: SearchPaneHandle): () => void;
  /**
   * Reveals the search pane and focuses a box of it once it shows, its query selected; false when
   * no panel holds the pane.
   */
  focusSearch(box: SearchPaneBox): boolean;
  /** The editor's comments, for the built-in comments pane. */
  readonly comments: DocumentCommentsOptions | undefined;
}

export const EditorPanesContext = createContext<EditorPanes | null>(null);

function createPaneHolders() {
  const holders = new Set<PaneHolder>();
  return {
    add(holder: PaneHolder) {
      holders.add(holder);
      return () => {
        holders.delete(holder);
      };
    },
    reveal(paneId: string, options: RevealPaneOptions = {}) {
      for (const holder of holders) {
        if (!holder.has(paneId)) continue;
        holder.reveal(paneId, options);
        return true;
      }
      return false;
    },
  };
}

// The search panes drawn, by their element, which the find keys focus in the panel revealing one.
function createSearchFocus(reveal: (paneId: string, options: RevealPaneOptions) => boolean) {
  const shown = new Map<HTMLElement, SearchPaneHandle>();
  return {
    attachSearch(element: HTMLElement, handle: SearchPaneHandle) {
      shown.set(element, handle);
      return () => {
        if (shown.get(element) === handle) shown.delete(element);
      };
    },
    focusSearch(box: SearchPaneBox) {
      return reveal('search', {
        onShown: (pane) => {
          const handle = [...shown].find(([element]) => pane.contains(element))?.[1];
          if (box === 'replace') handle?.focusReplacement();
          else handle?.focusQuery();
        },
      });
    },
  };
}

function createPanes() {
  const holders = createPaneHolders();
  return { ...holders, ...createSearchFocus(holders.reveal) };
}

/** One editor's side panels, the same object while its comments stay the same. */
export function useEditorPanes(comments: DocumentCommentsOptions | undefined): EditorPanes {
  const [panes] = useState(createPanes);
  return useMemo(() => ({ ...panes, comments }), [panes, comments]);
}

/** The side panels of the editor holding the calling panel; null outside an editor. */
export function useEditorPanesContext(): EditorPanes | null {
  return useContext(EditorPanesContext);
}

// Shared revision presentation for the document's and template's saved histories.
export type { RevisionLabels } from './revision-labels.js';
export { DEFAULT_REVISION_LABELS } from './revision-labels.js';
export { RevisionList } from './revision-list.js';
