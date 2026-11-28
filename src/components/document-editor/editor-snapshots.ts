// The synchronous and asynchronous snapshots exposed by the editor handle.

import type { EditorView } from 'prosemirror-view';
import type { RefObject } from 'react';
import { fontFaceRules } from '../../document/font-faces.js';
import {
  documentSnapshot,
  type ReadySnapshotOptions,
  snapshotOutline,
} from '../../engine/index.js';
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
function inMarkupOf<T>(
  layout: LayoutProgress,
  markup: SuggestionMarkup | undefined,
  take: (available: boolean) => T,
): T {
  return markup ? layout.inMarkup(markup, take) : take(true);
}

export interface SnapshotDrawing {
  readonly view: EditorView | null;
  readonly template: TemplateFile;
}

interface SnapshotSource {
  readonly references: ReferenceSourceAdapter | undefined;
  readonly layout: LayoutProgress;
  readonly drawing: RefObject<SnapshotDrawing | null>;
  readonly signal?: AbortSignal | undefined;
}

/** Captures the settled editor view and its current drawn template and faces. */
export function captureEditorSnapshot(
  view: EditorView,
  { drawing, layout, references, signal }: SnapshotSource,
  { resolveImage, ...options }: Omit<ReadySnapshotOptions, 'template' | 'whenSettled'> = {},
): Promise<string> {
  const currentTemplate = () => {
    const current = drawing.current;
    if (!current || current.view !== view || signal?.aborted)
      throw new Error('The document layout is unavailable.');
    return current.template;
  };
  return snapshotOnceReady(
    view,
    {
      resolveImage,
      checkView: currentTemplate,
      whenSettled: () => {
        currentTemplate();
        return layout.whenSettled();
      },
      waitForDocumentFonts: () => {
        currentTemplate();
        return !layout.servedFonts();
      },
      readSnapshot() {
        const template = currentTemplate();
        return {
          citationHref: hrefOf(references),
          ...options,
          styles: servedStyles(layout, options.styles),
          template,
        };
      },
    },
    (capture) => {
      currentTemplate();
      return inMarkupOf(layout, options.markup, (available) => {
        if (!available) throw new Error('The document layout is unavailable.');
        return allLines(layout, capture);
      });
    },
  );
}

// The handle's snapshots of the view as it shows now.
export function snapshotMethods(
  view: EditorView | null,
  source: SnapshotSource & { readonly template: TemplateFile },
): Pick<DocumentEditorHandle, 'exportSnapshot' | 'exportSnapshotAsync' | 'snapshotOutline'> {
  const { template, references, layout } = source;
  const citationHref = hrefOf(references);
  return {
    // Every page is drawn on the layout engine's lines while the snapshot is taken.
    // In the snapshot's markup, its pages are laid out in it while it is taken.
    exportSnapshot: (options) =>
      view
        ? allLines(layout, () =>
            inMarkupOf(layout, options?.markup, (available) =>
              available
                ? documentSnapshot(view, {
                    citationHref,
                    ...options,
                    styles: servedStyles(layout, options?.styles),
                    template,
                  })
                : null,
            ),
          )
        : null,
    exportSnapshotAsync: async (options) =>
      view ? captureEditorSnapshot(view, source, options) : null,
    snapshotOutline: () => (view ? snapshotOutline(view, template) : []),
  };
}

// Runs `take` with every page drawn on the layout engine's lines (DOCE-PAGINATION-11.6), and lets
// the pages near the screen come back once it is done, unless the host or another snapshot still
// asks for every page.
function allLines<T>(layout: LayoutProgress, take: () => T): T {
  const release = layout.holdAllLines();
  try {
    return take();
  } finally {
    release();
  }
}
