// Keeps a document editor's state in its layout. Each section is shown in its template section's
// scope, and its changes from an older version, when there is one, are shown on it. On pages, a pagination measures the document in a hidden view inside the editor and lays
// it out after every change, each section on pages of its own size; in the web layout each section
// is one page, so leaving the pages joins them back.

import type { RichTextStateUpdate } from '@flamboyantengineer/ui-components/rich-text-editor';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState, Plugin, PluginKey } from 'prosemirror-state';
import { type RefObject, useEffect, useRef } from 'react';
import {
  createDocumentSections,
  createSearch,
  createVersionChanges,
  documentSectionsKey,
  proofingKey,
  refreshVersionChanges,
  searchKey,
  type VersionChangeDisplay,
} from '../../engine/index.js';
import {
  createLayoutRules,
  findTemplateSection,
  joinDocumentPages,
  resolveFootnoteSettings,
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
  /** The older version the document is compared with, and how its changes show. */
  readonly compare: DocumentComparison | null;
}

/** An older version to show a document's changes from, as change bars or marked in place. */
export interface DocumentComparison {
  readonly previous: ProseMirrorNode;
  /** Defaults to markup. */
  readonly display?: VersionChangeDisplay | undefined;
}

// The height inside the page margins of a section's template scope.
function bodyHeight(template: TemplateFile, section: ProseMirrorNode): number {
  const scope = findTemplateSection(template, section.attrs.sectionName as string | null);
  const { height, margins } = templatePageMetrics(template, scope);
  return height - margins.top - margins.bottom;
}

// The plugins the measuring view runs: the editor's, with the layout's own plugins once. Proofing
// and search are left out: their marks take no room, and the hidden view would do their work again.
const UNMEASURED = new Set<PluginKey>([proofingKey, searchKey]);

function withOwn(plugins: readonly Plugin[], own: readonly Plugin[]): Plugin[] {
  const measured = (plugin: Plugin) => !UNMEASURED.has(plugin.spec.key as PluginKey);
  return [
    ...plugins.filter((plugin) => !own.includes(plugin) && measured(plugin)),
    ...own.filter(measured),
  ];
}

// A state with its sections shown in the template again, out of the history.
const restyleSections = (state: EditorState) =>
  state.apply(state.tr.setMeta(documentSectionsKey, true).setMeta('addToHistory', false));

// A state compared with the older version again, out of the history.
const recompare = (state: EditorState) => state.apply(refreshVersionChanges(state.tr));

// A state with each section's pages joined into one, out of the history.
function joinPages(state: EditorState): EditorState {
  const join = joinDocumentPages(state.doc);
  if (!join.steps.length) return state;
  const tr = state.tr;
  for (const step of join.steps) tr.step(step);
  return state.apply(tr.setMeta('addToHistory', false));
}

// A new state the host hands in, such as another document, takes the layout's plugins again.
function useLayoutPlugins(
  options: DocumentLayoutOptions,
  [own, pagination]: readonly [RefObject<readonly Plugin[]>, RefObject<Plugin | null>],
) {
  const { plugins } = options.state;
  const { onStateChange } = options;
  useEffect(() => {
    const layoutPlugins = [...own.current, ...(pagination.current ? [pagination.current] : [])];
    if (layoutPlugins.every((plugin) => plugins.includes(plugin))) return;
    onStateChange((state) => {
      const absent = layoutPlugins.filter((plugin) => !state.plugins.includes(plugin));
      if (absent.length === 0) return state;
      return restyleSections(state.reconfigure({ plugins: [...state.plugins, ...absent] }));
    });
  }, [plugins, onStateChange, own, pagination]);
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
  // The template's settings that change how the pages are laid out: the pagination starts over
  // when they do.
  const repeatTableHeader = template.styles?.table?.repeatHeader ?? true;
  const footnoteNumbering = resolveFootnoteSettings(template, null).numbering ?? 'document';
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const refresh = useRef<(() => void) | null>(null);
  const ownPlugins = useRef<readonly Plugin[]>([]);
  const paginationPlugin = useRef<Plugin | null>(null);

  useEffect(() => {
    const own = [
      createSearch(),
      createDocumentSections({ template: () => latest.current.template }),
      createVersionChanges({
        previous: () => latest.current.compare?.previous ?? null,
        display: () => latest.current.compare?.display ?? 'markup',
      }),
    ];
    ownPlugins.current = own;
    const { onStateChange } = latest.current;
    onStateChange((state) =>
      restyleSections(state.reconfigure({ plugins: [...state.plugins, ...own] })),
    );
    return () => {
      ownPlugins.current = [];
      onStateChange((state) =>
        state.reconfigure({ plugins: state.plugins.filter((plugin) => !own.includes(plugin)) }),
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
      plugins: withOwn(latest.current.state.plugins, ownPlugins.current),
      rules: createLayoutRules({ repeatTableHeader }),
      footnoteNumbering,
    });
    refresh.current = () => {
      pagination.refresh({ remeasure: true });
    };
    paginationPlugin.current = pagination.plugin;
    const { onStateChange } = latest.current;
    onStateChange((state) => state.reconfigure({ plugins: [...state.plugins, pagination.plugin] }));
    return () => {
      refresh.current = null;
      paginationPlugin.current = null;
      onStateChange((state) =>
        state.reconfigure({
          plugins: state.plugins.filter((plugin) => plugin !== pagination.plugin),
        }),
      );
    };
  }, [layout, measureIn, repeatTableHeader, footnoteNumbering]);

  useLayoutPlugins(options, [ownPlugins, paginationPlugin]);

  useEffect(() => {
    latest.current.onStateChange(restyleSections);
    refresh.current?.();
  }, [template]);

  const { previous, display } = options.compare ?? {};
  useEffect(() => {
    latest.current.onStateChange(recompare);
    refresh.current?.();
  }, [previous, display]);
}
