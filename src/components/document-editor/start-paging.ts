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
  loadTemplateFonts,
  type PagedProjection,
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

// The refs the page layout keeps: how to lay out again, what lays out, and the plugins it added.
interface PagingRefs {
  readonly refresh: RefObject<(() => void) | null>;
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
  if (latest.current.projection) {
    const projection = startProjection(setup, latest, { own: ownPlugins.current, setPaged });
    active.current = projection;
    refresh.current = () => projection.refresh({ remeasure: true });
    return () => {
      refresh.current = null;
      active.current = null;
      setPaged(null);
      projection.destroy();
    };
  }
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

// A projection of the state on pages: the ghost measures with the state's plugins that take room,
// and the editor renders each projection state it makes.
function startProjection(
  setup: Omit<Parameters<typeof createPagination>[0], 'plugins'>,
  latest: RefObject<DocumentLayoutOptions>,
  { own, setPaged }: { own: readonly Plugin[]; setPaged: (paged: PagedEditor | null) => void },
): PagedProjection {
  let made: PagedProjection | null = null;
  const projection = createPagedProjection({
    ...setup,
    state: latest.current.state,
    pageHeight: setup.pageHeight,
    // The engine renders the projection's states with React node identities kept.
    plugins: [reactKeys()],
    ghostPlugins: withOwn(latest.current.state.plugins, own),
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
