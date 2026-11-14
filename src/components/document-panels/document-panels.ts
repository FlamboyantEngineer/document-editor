// The editor's panels: the side panels an editor holds, by the panes in them, so the editor's handle can reveal a pane
// in whichever panel holds it (`revealPane`), and what the built-in panes draw on from the editor:
// its comments.

import { createContext, useContext, useMemo, useState } from 'react';
import type { DocumentCommentsOptions } from '../document-comments/document-comments.js';

/** How a pane is revealed. */
export interface RevealPaneOptions {
  /** Moves focus into the pane once it shows. Defaults to true. */
  readonly focus?: boolean | undefined;
}

/** A side panel as the editor knows it: whether it holds a pane, and revealing one. */
export interface PaneHolder {
  has(paneId: string): boolean;
  reveal(paneId: string, options: RevealPaneOptions): void;
}

/** The side panels of one editor, and what its built-in panes draw on. */
export interface EditorPanes {
  /** Adds a panel; the returned function removes it. */
  add(holder: PaneHolder): () => void;
  /** Reveals a pane in the first panel holding it; false when none does. */
  reveal(paneId: string, options?: RevealPaneOptions): boolean;
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

/** One editor's side panels, the same object while its comments stay the same. */
export function useEditorPanes(comments: DocumentCommentsOptions | undefined): EditorPanes {
  const [holders] = useState(createPaneHolders);
  return useMemo(() => ({ ...holders, comments }), [holders, comments]);
}

/** The side panels of the editor holding the calling panel; null outside an editor. */
export function useEditorPanesContext(): EditorPanes | null {
  return useContext(EditorPanesContext);
}

// Shared revision presentation for the document's and template's saved histories.
export type { RevisionLabels } from './revision-labels.js';
export { DEFAULT_REVISION_LABELS } from './revision-labels.js';
export { RevisionList } from './revision-list.js';
