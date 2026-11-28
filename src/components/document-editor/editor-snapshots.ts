// The synchronous and asynchronous snapshots exposed by the editor handle.

import type { EditorView } from 'prosemirror-view';
import type { RefObject } from 'react';
import { fontFaceRules } from '../../document/font-faces.js';
import { documentSnapshot, snapshotOutline } from '../../engine/index.js';
import { snapshotOnceReady } from '../../engine/snapshot-ready.js';
import type { ReferenceSourceAdapter } from '../../host/index.js';
import type { SuggestionMarkup } from '../../layout-engine/hidden-suggestions.js';
import type { TemplateFile } from '../../model/index.js';
import type { CitationHref } from '../../model/schema/reference-mark.js';
import type { DocumentEditorHandle } from './editor-handle.js';
import type { LayoutProgress } from './layout-progress.js';

// Where the host links a printed citation: its references adapter's `href`, when it gives one.
const hrefOf = (references: ReferenceSourceAdapter | undefined): CitationHref | undefined =>
  references?.href ? (citation) => references.href?.(citation) ?? null : undefined;

// A snapshot's stylesheets, after the served faces the pages were measured and drawn with, under
// the families the pages draw them in too (DOCE-PAGINATION-12.8), so it prints in the glyphs its
// lines were broken in (DOCE-PAGINATION-13.8).
function servedStyles(layout: LayoutProgress, styles: readonly string[] | undefined) {
  const faces = fontFaceRules(layout.drawnFonts());
  return faces ? [faces, ...(styles ?? [])] : styles;
}

// Takes something of the pages laid out in a markup, when one is asked for.
export const inMarkupOf =
  <T>(layout: LayoutProgress, markup: SuggestionMarkup | undefined) =>
  (take: () => T): T =>
    markup ? layout.inMarkup(markup, take) : take();

export interface SnapshotDrawing {
  readonly view: EditorView | null;
  readonly template: TemplateFile;
}

// The handle's snapshots of the view as it shows now.
export function snapshotMethods(
  view: EditorView | null,
  {
    template,
    references,
    layout,
    drawing,
  }: {
    template: TemplateFile;
    references: ReferenceSourceAdapter | undefined;
    layout: LayoutProgress;
    drawing: RefObject<SnapshotDrawing | null>;
  },
): Pick<DocumentEditorHandle, 'exportSnapshot' | 'exportSnapshotAsync' | 'snapshotOutline'> {
  const citationHref = hrefOf(references);
  const currentTemplate = () => {
    const current = drawing.current;
    if (!current || current.view !== view) throw new Error('The document layout is unavailable.');
    return current.template;
  };
  return {
    // Every page is drawn on the layout engine's lines while the snapshot is taken.
    // In the snapshot's markup, its pages are laid out in it while it is taken.
    exportSnapshot: (options) =>
      view
        ? allLines(layout, () =>
            inMarkupOf<string>(
              layout,
              options?.markup,
            )(() =>
              documentSnapshot(view, {
                citationHref,
                ...options,
                styles: servedStyles(layout, options?.styles),
                template,
              }),
            ),
          )
        : null,
    exportSnapshotAsync: async (options = {}) => {
      if (!view) return null;
      const { resolveImage, ...supplied } = options;
      return allLines(layout, () =>
        snapshotOnceReady(
          view,
          {
            resolveImage,
            whenSettled: () => {
              currentTemplate();
              return layout.whenSettled();
            },
            waitForDocumentFonts: () => !layout.servedFonts(),
            readSnapshot: () => ({
              citationHref,
              ...supplied,
              styles: servedStyles(layout, supplied.styles),
              template: currentTemplate(),
            }),
          },
          inMarkupOf(layout, options.markup),
        ),
      );
    },
    snapshotOutline: () => (view ? snapshotOutline(view, template) : []),
  };
}

// Runs `take` with every page drawn on the layout engine's lines (DOCE-PAGINATION-11.6), and lets
// the pages near the screen come back once it is done, unless the host or another snapshot still
// asks for every page.
function allLines<T>(layout: LayoutProgress, take: () => T): T {
  const release = layout.holdAllLines();
  let async = false;
  try {
    const result = take();
    if (result instanceof Promise) {
      async = true;
      return result.finally(release) as T;
    }
    return result;
  } finally {
    if (!async) release();
  }
}
