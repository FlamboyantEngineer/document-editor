// Keeps a document editor's state in its layout. Each section is shown in its template section's
// scope, and its changes from an older version, when there is one, are shown on it. On pages, a
// projection measures the document in a hidden view inside the editor and lays it out after every
// change, each section on pages of its own size; in the web layout each section is one page, so
// leaving the pages joins them back.

import type {
  RichTextNodeViewProps,
  RichTextStateUpdate,
} from '@flamboyantengineer/ui-components/rich-text-editor';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState, Plugin, Transaction } from 'prosemirror-state';
import {
  type ComponentType,
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type CompareSuggestions,
  createAuthorship,
  createChangeLines,
  createDocumentSections,
  createDynamicTemplates,
  createRegionEditing,
  createSearch,
  createSectionFootnoteNumbers,
  createTemplateContentEditing,
  createVersionChanges,
  documentSectionsKey,
  refreshDynamicTemplates,
  refreshVersionChanges,
  type RegionChange,
  sectionFootnoteNumbersKey,
  type VersionChangeDisplay,
} from '../../engine/index.js';
import type { FontsAdapter, VariablesAdapter } from '../../host/index.js';
import {
  type FragmentRules,
  joinDocumentPages,
  type LayoutRules,
  resolveFootnoteSettings,
  type TemplateFile,
  type TemplatePartChange,
} from '../../model/index.js';
import {
  type CanonicalChange,
  createListStarts,
  createPageDebug,
  createPageVariables,
  type LayoutState,
  pageDebugKey,
  type PageDebugParts,
  pageVariablesKey,
  type PaginationStats,
} from '../../pagination/index.js';
import {
  fragmentRulesOf,
  type LayoutRunner,
  type PagingRefs,
  type Redraw,
  startPaging,
} from './start-paging.js';
import type { PagedEditor } from './use-paged-projection.js';

/** How a document is shown: on pages, or as one page per section that fills its surface. */
export type DocumentLayout = 'page' | 'web';

// The plugins the layout adds to the editor's own, reading the options as they are now.
function layoutOwnPlugins(latest: RefObject<DocumentLayoutOptions>): Plugin[] {
  return [
    createPageDebug({ shown: () => latest.current.debug ?? {} }),
    createListStarts(),
    createPageVariables({ value: (key) => latest.current.variables?.value(key) }),
    createDynamicTemplates({ value: (key) => latest.current.variables?.value(key) }),
    createSectionFootnoteNumbers({
      enabled: () =>
        latest.current.layout === 'web' &&
        resolveFootnoteSettings(latest.current.template, null).numbering === 'page',
    }),
    createSearch(),
    createSearch('pane'),
    createAuthorship(),
    createRegionEditing({
      enabled: () => Boolean(latest.current.onRegionChange),
      template: () => latest.current.template,
      onChange: (change) => latest.current.onRegionChange?.(change),
    }),
    createTemplateContentEditing({
      enabled: () => Boolean(latest.current.onTemplatePartChange),
      onChange: (change) => latest.current.onTemplatePartChange?.(change),
    }),
    createDocumentSections({ template: () => latest.current.template }),
    createChangeLines(),
    createVersionChanges({
      previous: () => latest.current.compare?.previous ?? null,
      display: () => latest.current.compare?.display ?? 'markup',
      suggestions: () => latest.current.compare?.suggestions ?? 'rejected',
      scope: () => latest.current.compare?.scope ?? null,
    }),
  ];
}

// Editing the regions in place, or no longer, sets them again: editable or read-only.
function useRegionsEditable(
  editable: string,
  onStateChange: (update: RichTextStateUpdate) => void,
) {
  const latest = useRef(onStateChange);
  useEffect(() => {
    latest.current = onStateChange;
  });
  useEffect(() => {
    latest.current((state) =>
      state.apply(state.tr.setMeta(documentSectionsKey, true).setMeta('addToHistory', false)),
    );
  }, [editable]);
}

// Showing or hiding the layout for debugging draws the pages again.
function useLayoutDebug(
  debug: PageDebugParts | undefined,
  onStateChange: (update: RichTextStateUpdate) => void,
  redraw: RefObject<Redraw | null>,
) {
  const latest = useRef(onStateChange);
  useEffect(() => {
    latest.current = onStateChange;
  });
  const shown = `${String(debug?.pages ?? false)} ${String(debug?.blocks ?? false)}`;
  useEffect(() => {
    latest.current((state) => state.apply(state.tr.setMeta(pageDebugKey, true)));
    redraw.current?.(pageDebugKey);
  }, [shown, redraw]);
}

// Whether each scope of the template repeats a table's header rows on its pages: the template's,
// then each section's, for the pages to start over when any changes (DOCE-PAGINATION-4.5).
const repeatHeaderKey = (template: TemplateFile) =>
  [template, ...(template.sections ?? [])]
    .map((scope) => String(scope.styles?.table?.repeatHeader ?? ''))
    .join(' ');

/** What the layout hook reads. */
export interface DocumentLayoutOptions {
  readonly layout: DocumentLayout;
  readonly template: TemplateFile;
  readonly state: EditorState;
  readonly onStateChange: (update: RichTextStateUpdate) => void;
  /** The older version the document is compared with, and how its changes show. */
  readonly compare: DocumentComparison | null;
  /** Shows the pages' layout for debugging (DOCE-PAGINATION-7.4). */
  readonly debug?: PageDebugParts | undefined;
  /** Tells of each change of the layout state; the web layout is always settled. */
  readonly onLayoutStateChange?: ((state: LayoutState) => void) | undefined;
  /**
   * The host's layout rules by node type, over the library's (`createLayoutRules`), read as each
   * section lays out: how its blocks split and keep together (DOCE-PAGINATION-1.7).
   */
  readonly layoutRules?: LayoutRules | undefined;
  /**
   * The host's fragment rules by node type, over `FRAGMENT_RULES`, read when the pages mount: how
   * its fragments join.
   */
  readonly fragmentRules?: FragmentRules | undefined;
  /** The host's font faces, which the pages wait for (DOCE-PAGINATION-5.6). */
  readonly fonts?: FontsAdapter | undefined;
  /** Edits the pages' headers and footers in place, handing each edit here. */
  readonly onRegionChange?: ((change: RegionChange) => void) | undefined;
  /** Edits a template's section content and placeholders in place, handing each edit here. */
  readonly onTemplatePartChange?: ((change: TemplatePartChange) => void) | undefined;
  /** The host's variables, shown in the headers, footers and text (`createPageVariables`). */
  readonly variables?: VariablesAdapter | undefined;
  /**
   * The host's React node views, which a projection's ghost renders as the pages do, read when the
   * pages mount.
   */
  readonly nodeViews?: Readonly<Record<string, ComponentType<RichTextNodeViewProps>>> | undefined;
  /** Wraps the ghost's React node views in the providers the editor's own views render under. */
  readonly wrapGhost?: ((view: ReactNode) => ReactNode) | undefined;
  /** Takes each canonical transaction input on the projection's pages makes. */
  readonly onCanonical?: ((tr: Transaction, made: CanonicalChange) => void) | undefined;
  /** Told of each layout of the projection's pages. */
  readonly onLayout?: ((tr: Transaction) => void) | undefined;
}

/** An older version to show a document's changes from, as change bars or marked in place. */
export interface DocumentComparison {
  /** The older version, or `opened` for the document as the editor opened it. */
  readonly previous: ProseMirrorNode | 'opened';
  /** Defaults to markup. */
  readonly display?: VersionChangeDisplay | undefined;
  /** Whether the document's suggestions count as rejected (the default) or as accepted. */
  readonly suggestions?: CompareSuggestions | undefined;
  /** The element ids compared, a heading for its headed section; the others are marked outside. */
  readonly scope?: readonly string[] | undefined;
}

// A state with its sections shown in the template again, out of the history.
const restyleSections = (state: EditorState) =>
  state.apply(
    state.tr
      .setMeta(documentSectionsKey, true)
      .setMeta(sectionFootnoteNumbersKey, true)
      .setMeta('addToHistory', false),
  );

// A state compared with the older version again, out of the history.
const recompare = (state: EditorState) => state.apply(refreshVersionChanges(state.tr));

// A state showing the variables' values again, in the text and the template blocks, out of the
// history.
const revalue = (state: EditorState) =>
  state.apply(refreshDynamicTemplates(state.tr.setMeta(pageVariablesKey, true)));

// The host's variables shown again, and the pages measured again, whenever the host says they
// changed, and when it hands in other variables.
function useHostVariables(
  options: DocumentLayoutOptions,
  { refresh, redraw }: Pick<PagingRefs, 'refresh' | 'redraw'>,
) {
  const { variables, onStateChange } = options;
  const latest = useRef(onStateChange);
  useEffect(() => {
    latest.current = onStateChange;
  });
  useEffect(() => {
    const show = () => {
      latest.current(revalue);
      redraw.current?.(pageVariablesKey);
      refresh.current?.();
    };
    show();
    return variables?.subscribe?.(show);
  }, [variables, refresh, redraw]);
}

// A state with each section's pages joined into one and its footnotes numbered for it, out of the
// history.
function joinPages(state: EditorState, rules: FragmentRules): EditorState {
  const join = joinDocumentPages(state.doc, rules);
  const tr = state.tr.setMeta(sectionFootnoteNumbersKey, true);
  for (const step of join.steps) tr.step(step);
  return state.apply(tr.setMeta('addToHistory', false));
}

// A new state the host hands in, such as another document, takes the layout's plugins again.
function useLayoutPlugins(options: DocumentLayoutOptions, own: RefObject<readonly Plugin[]>) {
  const { plugins } = options.state;
  const { onStateChange } = options;
  useEffect(() => {
    const layoutPlugins = own.current;
    if (layoutPlugins.every((plugin) => plugins.includes(plugin))) return;
    onStateChange((state) => {
      const absent = layoutPlugins.filter((plugin) => !state.plugins.includes(plugin));
      if (absent.length === 0) return state;
      return restyleSections(state.reconfigure({ plugins: [...state.plugins, ...absent] }));
    });
  }, [plugins, onStateChange, own]);
}

/** What the layout tells of its pages: when they settle, and what their layouts did. */
export interface LayoutProgress {
  /** Resolves with `settled` or `failed` once no layout is pending; at once in the web layout. */
  whenSettled(): Promise<LayoutState>;
  /** What the layouts did since the pages were first laid out; null in the web layout. */
  stats(): PaginationStats | null;
}

// What the active pagination tells of its pages; with none, in the web layout, they are settled.
function useLayoutProgress(active: RefObject<LayoutRunner | null>): LayoutProgress {
  return useMemo(
    () => ({
      whenSettled: () => active.current?.whenSettled() ?? Promise.resolve('settled'),
      stats: () => active.current?.stats() ?? null,
    }),
    [active],
  );
}

/**
 * Shows each section in its template section's scope, lays the document out on a paged projection
 * in page layout, measuring it in the element `measureIn` holds, and joins its pages in the web
 * layout. A new
 * template restyles the sections and lays the pages out again.
 */
export function useDocumentLayout(
  measureIn: RefObject<HTMLDivElement | null>,
  options: DocumentLayoutOptions,
): LayoutProgress & { readonly paged: PagedEditor | null } {
  const { layout, template } = options;
  // The template's settings that change how the pages are laid out: the pagination starts over
  // when they do.
  const repeatHeaders = repeatHeaderKey(template);
  const footnoteNumbering = resolveFootnoteSettings(template, null).numbering ?? 'document';
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const refresh = useRef<(() => void) | null>(null);
  const redraw = useRef<Redraw | null>(null);
  const ownPlugins = useRef<readonly Plugin[]>([]);
  const active = useRef<LayoutRunner | null>(null);
  const [paged, setPaged] = useState<PagedEditor | null>(null);

  useEffect(() => {
    const own = layoutOwnPlugins(latest);
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

  // A projection's pages hold nodes of the document's schema, so a document of another schema, as
  // a host opening another document may hand in, starts them over.
  const { schema } = options.state;
  useEffect(() => {
    const element = measureIn.current;
    if (layout !== 'page' || !element) {
      latest.current.onStateChange((state) => joinPages(state, fragmentRulesOf(latest.current)));
      latest.current.onLayoutStateChange?.('settled');
      return undefined;
    }
    return startPaging(element, latest, {
      settings: { footnoteNumbering },
      refs: { refresh, redraw, active, ownPlugins },
      setPaged,
    });
  }, [layout, measureIn, repeatHeaders, footnoteNumbering, schema]);

  useLayoutPlugins(options, ownPlugins);

  useEffect(() => {
    latest.current.onStateChange(restyleSections);
    refresh.current?.();
  }, [template]);

  const { previous, display, suggestions, scope } = options.compare ?? {};
  const scopeKey = scope?.join(' ');
  useEffect(() => {
    latest.current.onStateChange(recompare);
    refresh.current?.();
  }, [previous, display, suggestions, scopeKey]);
  useHostVariables(options, { refresh, redraw });
  useLayoutDebug(options.debug, options.onStateChange, redraw);
  useRegionsEditable(
    `${String(Boolean(options.onRegionChange))} ${String(Boolean(options.onTemplatePartChange))}`,
    options.onStateChange,
  );
  const progress = useLayoutProgress(active);
  return useMemo(() => ({ ...progress, paged }), [progress, paged]);
}
