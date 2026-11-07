// Keeps a document editor's state in its layout. On pages, a pagination measures the document in a
// hidden view inside the editor and lays it out after every change; in the web layout each
// section is one page, so leaving the pages joins them back.

import type { RichTextStateUpdate } from '@flamboyantengineer/ui-components/rich-text-editor';
import type { EditorState } from 'prosemirror-state';
import { type RefObject, useEffect, useRef } from 'react';
import { joinDocumentPages, type TemplateFile, templatePageMetrics } from '../../model/index.js';
import { createPagination } from '../../pagination/index.js';

/** How a document is shown: on pages, or as one page per section that fills its surface. */
export type DocumentLayout = 'page' | 'web';

/** What the layout hook reads. */
export interface DocumentLayoutOptions {
  readonly layout: DocumentLayout;
  readonly template: TemplateFile;
  readonly state: EditorState;
  readonly onStateChange: (update: RichTextStateUpdate) => void;
}

// The height inside a template's page margins.
function bodyHeight(template: TemplateFile): number {
  const { height, margins } = templatePageMetrics(template);
  return height - margins.top - margins.bottom;
}

// A state with each section's pages joined into one, out of the history.
function joinPages(state: EditorState): EditorState {
  const join = joinDocumentPages(state.doc);
  if (!join.steps.length) return state;
  const tr = state.tr;
  for (const step of join.steps) tr.step(step);
  return state.apply(tr.setMeta('addToHistory', false));
}

/**
 * Paginates the document in page layout, measuring it in the element `measureIn` holds, and joins
 * its pages in the web layout. A new template lays the pages out again.
 */
export function useDocumentLayout(
  measureIn: RefObject<HTMLDivElement | null>,
  options: DocumentLayoutOptions,
): void {
  const { layout, template } = options;
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const refresh = useRef<(() => void) | null>(null);

  useEffect(() => {
    const element = measureIn.current;
    if (layout !== 'page' || !element) {
      latest.current.onStateChange(joinPages);
      return undefined;
    }
    const pagination = createPagination({
      measureIn: element,
      pageHeight: () => bodyHeight(latest.current.template),
      plugins: latest.current.state.plugins,
    });
    refresh.current = () => {
      pagination.refresh({ remeasure: true });
    };
    const { onStateChange } = latest.current;
    onStateChange((state) => state.reconfigure({ plugins: [...state.plugins, pagination.plugin] }));
    return () => {
      refresh.current = null;
      onStateChange((state) =>
        state.reconfigure({
          plugins: state.plugins.filter((plugin) => plugin !== pagination.plugin),
        }),
      );
    };
  }, [layout, measureIn]);

  useEffect(() => {
    refresh.current?.();
  }, [template]);
}
