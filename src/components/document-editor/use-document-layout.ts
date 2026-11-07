// Keeps a document editor's state in its layout. Each section is shown in its template section's
// scope. On pages, a pagination measures the document in a hidden view inside the editor and lays
// it out after every change, each section on pages of its own size; in the web layout each section
// is one page, so leaving the pages joins them back.

import type { RichTextStateUpdate } from '@flamboyantengineer/ui-components/rich-text-editor';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState, Plugin } from 'prosemirror-state';
import { type RefObject, useEffect, useRef } from 'react';
import { createDocumentSections, documentSectionsKey } from '../../engine/index.js';
import {
  findTemplateSection,
  joinDocumentPages,
  type TemplateFile,
  templatePageMetrics,
} from '../../model/index.js';
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

// The height inside the page margins of a section's template scope.
function bodyHeight(template: TemplateFile, section: ProseMirrorNode): number {
  const scope = findTemplateSection(template, section.attrs.sectionName as string | null);
  const { height, margins } = templatePageMetrics(template, scope);
  return height - margins.top - margins.bottom;
}

// The plugins the measuring view runs: the editor's, with the sections plugin once.
function withSections(plugins: readonly Plugin[], sections: Plugin | null): Plugin[] {
  const others = plugins.filter((plugin) => plugin !== sections);
  return sections ? [...others, sections] : others;
}

// A state with its sections shown in the template again, out of the history.
const restyleSections = (state: EditorState) =>
  state.apply(state.tr.setMeta(documentSectionsKey, true).setMeta('addToHistory', false));

// A state with each section's pages joined into one, out of the history.
function joinPages(state: EditorState): EditorState {
  const join = joinDocumentPages(state.doc);
  if (!join.steps.length) return state;
  const tr = state.tr;
  for (const step of join.steps) tr.step(step);
  return state.apply(tr.setMeta('addToHistory', false));
}

/**
 * Shows each section in its template section's scope, paginates the document in page layout,
 * measuring it in the element `measureIn` holds, and joins its pages in the web layout. A new
 * template restyles the sections and lays the pages out again.
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
  const sectionsPlugin = useRef<Plugin | null>(null);

  useEffect(() => {
    const sections = createDocumentSections({ template: () => latest.current.template });
    sectionsPlugin.current = sections;
    const { onStateChange } = latest.current;
    onStateChange((state) =>
      restyleSections(state.reconfigure({ plugins: [...state.plugins, sections] })),
    );
    return () => {
      sectionsPlugin.current = null;
      onStateChange((state) =>
        state.reconfigure({ plugins: state.plugins.filter((plugin) => plugin !== sections) }),
      );
    };
  }, []);

  useEffect(() => {
    const element = measureIn.current;
    if (layout !== 'page' || !element) {
      latest.current.onStateChange(joinPages);
      return undefined;
    }
    const pagination = createPagination({
      measureIn: element,
      pageHeight: (section) => bodyHeight(latest.current.template, section),
      plugins: withSections(latest.current.state.plugins, sectionsPlugin.current),
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
    latest.current.onStateChange(restyleSections);
    refresh.current?.();
  }, [template]);
}
