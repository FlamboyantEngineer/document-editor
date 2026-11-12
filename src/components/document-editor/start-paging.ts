// Starts laying a document editor's pages out, in page layout: by a pagination of the editor's
// state, or by a projection of it on pages (DOCE-PAGINATION-7.17), which the editor renders.

import { reactKeys } from '@handlewithcare/react-prosemirror';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Plugin, PluginKey } from 'prosemirror-state';
import type { RefObject } from 'react';
import { proofingKey, searchKey } from '../../engine/index.js';
import {
  createLayoutRules,
  findTemplateSection,
  FRAGMENT_RULES,
  type FragmentRules,
  type TemplateFile,
  templatePageMetrics,
} from '../../model/index.js';
import {
  createPagedProjection,
  createPagination,
  type LayoutState,
  listStartsKey,
  loadTemplateFonts,
  pageDebugKey,
  type PagedProjection,
  pageVariablesKey,
  type Pagination,
} from '../../pagination/index.js';
import type { DocumentLayoutOptions } from './use-document-layout.js';
import type { PagedEditor } from './use-paged-projection.js';

// What lays the pages out: a pagination of the state, or a projection of it.
export type LayoutRunner = Pick<Pagination, 'whenSettled' | 'stats'>;

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

/** The rules the pages' fragments join by: the library's, with the host's over them. */
export function fragmentRulesOf(options: DocumentLayoutOptions): FragmentRules {
  return { ...FRAGMENT_RULES, ...options.fragmentRules };
}

/** Has the plugins of these keys that read the pages draw them again. */
export type Redraw = (key: PluginKey) => void;

/** The refs the page layout keeps: how to lay out and draw again, what lays out, its plugins. */
export interface PagingRefs {
  readonly refresh: RefObject<(() => void) | null>;
  /** Set while a projection's pages run the plugins that read them. */
  readonly redraw: RefObject<Redraw | null>;
  readonly active: RefObject<LayoutRunner | null>;
  readonly ownPlugins: RefObject<readonly Plugin[]>;
  readonly paginationPlugin: RefObject<Plugin | null>;
}

// Lays the pages out in the element given: by a projection when asked, otherwise by a pagination
// of the state; returns how to stop.
export function startPaging(
  element: HTMLElement,
  latest: RefObject<DocumentLayoutOptions>,
  {
    settings,
    refs,
    setPaged,
  }: {
    settings: { repeatTableHeader: boolean; footnoteNumbering: 'document' | 'page' };
    refs: PagingRefs;
    setPaged: (paged: PagedEditor | null) => void;
  },
): () => void {
  const setup = {
    measureIn: element,
    pageHeight: (section: ProseMirrorNode) => bodyHeight(latest.current.template, section),
    rules: {
      ...createLayoutRules({ repeatTableHeader: settings.repeatTableHeader }),
      ...latest.current.layoutRules,
    },
    fragmentRules: fragmentRulesOf(latest.current),
    footnoteNumbering: settings.footnoteNumbering,
    onLayoutStateChange: (state: LayoutState) => latest.current.onLayoutStateChange?.(state),
  };
  const { refresh, active, ownPlugins, paginationPlugin } = refs;
  if (latest.current.projection) return startProjectionOf(setup, latest, { refs, setPaged });
  const pagination = createPagination({
    ...setup,
    plugins: withOwn(latest.current.state.plugins, ownPlugins.current),
    ready: loadTemplateFonts(latest.current.fonts, latest.current.template),
  });
  latest.current.onLayoutStateChange?.(pagination.layoutState());
  refresh.current = () => {
    pagination.refresh({ remeasure: true });
  };
  active.current = pagination;
  paginationPlugin.current = pagination.plugin;
  const { onStateChange } = latest.current;
  onStateChange((state) => state.reconfigure({ plugins: [...state.plugins, pagination.plugin] }));
  return () => {
    refresh.current = null;
    active.current = null;
    paginationPlugin.current = null;
    onStateChange((state) =>
      state.reconfigure({
        plugins: state.plugins.filter((plugin) => plugin !== pagination.plugin),
      }),
    );
  };
}

// The layout's plugins that read the pages, which run on a projection's pages rather than on the
// canonical state.
const ON_PAGES = new Set<PluginKey>([listStartsKey, pageDebugKey, pageVariablesKey]);
const onPages = (plugin: Plugin) => ON_PAGES.has(plugin.spec.key as PluginKey);

type PagingSetup = Omit<Parameters<typeof createPagination>[0], 'plugins'>;
type SetPaged = (paged: PagedEditor | null) => void;

// Lays the pages out as a projection of the state, the layout's plugins that read the pages moved
// from the state onto them; returns how to stop.
function startProjectionOf(
  setup: PagingSetup,
  latest: RefObject<DocumentLayoutOptions>,
  { refs, setPaged }: { refs: PagingRefs; setPaged: SetPaged },
): () => void {
  const { refresh, redraw, active, ownPlugins } = refs;
  const own = ownPlugins.current;
  const pages = own.filter(onPages);
  const kept = own.filter((plugin) => !onPages(plugin));
  const { onStateChange } = latest.current;
  ownPlugins.current = kept;
  onStateChange((state) =>
    state.reconfigure({ plugins: state.plugins.filter((plugin) => !pages.includes(plugin)) }),
  );
  const projection = startProjection(setup, latest, { own: ownPlugins.current, pages, setPaged });
  active.current = projection;
  refresh.current = () => projection.refresh({ remeasure: true });
  redraw.current = (key) => projection.redraw(key);
  return () => {
    refresh.current = null;
    redraw.current = null;
    active.current = null;
    setPaged(null);
    projection.destroy();
    // The pages' plugins go back to the state only while the layout keeps its plugins, as when
    // the projection is turned off, not as the editor goes.
    if (ownPlugins.current !== kept) return;
    ownPlugins.current = own;
    onStateChange((state) => state.reconfigure({ plugins: [...state.plugins, ...pages] }));
  };
}

// A projection of the state on pages: the ghost measures with the state's plugins that take room,
// the plugins that read the pages run on them, and the editor renders each projection state.
function startProjection(
  setup: PagingSetup,
  latest: RefObject<DocumentLayoutOptions>,
  {
    own,
    pages,
    setPaged,
  }: { own: readonly Plugin[]; pages: readonly Plugin[]; setPaged: SetPaged },
): PagedProjection {
  let made: PagedProjection | null = null;
  const projection = createPagedProjection({
    ...setup,
    state: latest.current.state,
    pageHeight: setup.pageHeight,
    ready: loadTemplateFonts(latest.current.fonts, latest.current.template),
    // The engine renders the projection's states with React node identities kept.
    plugins: [reactKeys(), ...pages],
    ghostPlugins: withOwn(
      latest.current.state.plugins.filter((plugin) => !pages.includes(plugin)),
      own,
    ),
    dispatch: (tr) => latest.current.onCanonical?.(tr),
    onProjection: (state) => {
      if (made) setPaged({ projection: made, state });
    },
    onLayout: (tr) => latest.current.onLayout?.(tr),
  });
  made = projection;
  setPaged({ projection, state: projection.projection });
  setup.onLayoutStateChange?.(projection.layoutState());
  return projection;
}
