// Starts laying a document editor's pages out, in page layout: by a projection of its state on
// pages (DOCE-PAGINATION-7.17), which the editor renders.

import {
  mountRichTextView,
  withoutReactKeys,
} from '@flamboyantengineer/ui-components/rich-text-editor';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Plugin, PluginKey } from 'prosemirror-state';
import type { RefObject } from 'react';
import { proofingKey, searchKey, searchPaneKey } from '../../engine/index.js';
import {
  createLayoutRules,
  findTemplateSection,
  FRAGMENT_RULES,
  type FragmentRules,
  type LayoutRules,
  type TemplateFile,
  templatePageMetrics,
} from '../../model/index.js';
import {
  createPagedProjection,
  type LayoutState,
  listStartsKey,
  loadTemplateFonts,
  type MeasuringView,
  type MeasuringViewOptions,
  pageDebugKey,
  type PagedProjection,
  type PagedProjectionOptions,
  pageVariablesKey,
  type SectionLayoutRules,
} from '../../pagination/index.js';
import type { DocumentLayoutOptions } from './use-document-layout.js';
import type { PagedEditor } from './use-paged-projection.js';

// What lays the pages out: a projection of the state.
export type LayoutRunner = Pick<PagedProjection, 'whenSettled' | 'stats'>;

// The height inside the page margins of a section's template scope.
function bodyHeight(template: TemplateFile, section: ProseMirrorNode): number {
  const scope = findTemplateSection(template, section.attrs.sectionName as string | null);
  const { height, margins } = templatePageMetrics(template, scope);
  return height - margins.top - margins.bottom;
}

// The plugins the measuring view runs: the editor's, with the layout's own plugins once. Proofing
// and search are left out: their marks take no room, and the hidden view would do their work again.
// So is a plugin whose spec says `measured: false`, such as the shared document's sync, whose view
// would bind the hidden view to the shared document a second time.
const UNMEASURED = new Set<PluginKey>([proofingKey, searchKey, searchPaneKey]);

function withOwn(plugins: readonly Plugin[], own: readonly Plugin[]): Plugin[] {
  const measured = (plugin: Plugin) =>
    plugin.spec.measured !== false && !UNMEASURED.has(plugin.spec.key as PluginKey);
  return [
    ...plugins.filter((plugin) => !own.includes(plugin) && measured(plugin)),
    ...own.filter(measured),
  ];
}

/**
 * The layout rules of each section: whether its tables repeat their header rows is the section's
 * own setting, else the template's (DOCE-PAGINATION-4.5), and the host's rules go over them; both
 * read from the latest options as each section lays out.
 */
export function sectionRules(latest: RefObject<DocumentLayoutOptions>): SectionLayoutRules {
  // The rules for each repeat-header value, made again when the host passes other layout rules.
  let made = { layoutRules: latest.current.layoutRules, byRepeat: new Map<boolean, LayoutRules>() };
  return (section) => {
    // Read as each section lays out, so a renamed section or other host rules apply at once.
    const { template, layoutRules } = latest.current;
    const scope = findTemplateSection(template, section.attrs.sectionName as string | null);
    const repeat =
      scope?.styles?.table?.repeatHeader ?? template.styles?.table?.repeatHeader ?? true;
    if (made.layoutRules !== layoutRules) made = { layoutRules, byRepeat: new Map() };
    let rules = made.byRepeat.get(repeat);
    if (!rules) {
      rules = { ...createLayoutRules({ repeatTableHeader: repeat }), ...layoutRules };
      made.byRepeat.set(repeat, rules);
    }
    return rules;
  };
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
}

// Lays the pages out in the element given, as a projection of the state; returns how to stop.
export function startPaging(
  element: HTMLElement,
  latest: RefObject<DocumentLayoutOptions>,
  {
    settings,
    refs,
    setPaged,
  }: {
    settings: { footnoteNumbering: 'document' | 'page' };
    refs: PagingRefs;
    setPaged: (paged: PagedEditor | null) => void;
  },
): () => void {
  const setup = {
    measureIn: element,
    pageHeight: (section: ProseMirrorNode) => bodyHeight(latest.current.template, section),
    rules: sectionRules(latest),
    fragmentRules: fragmentRulesOf(latest.current),
    footnoteNumbering: settings.footnoteNumbering,
    onLayoutStateChange: (state: LayoutState) => latest.current.onLayoutStateChange?.(state),
  };
  const start = () => startProjectionOf(setup, latest, { refs, setPaged });
  if (!ghostWith(latest)) return start();
  // Pending until the ghost has mounted, so nothing reads the pages as settled before then.
  setup.onLayoutStateChange('pending');
  return afterCommit(start);
}

// The layout's plugins that read the pages, which run on a projection's pages rather than on the
// canonical state.
const ON_PAGES = new Set<PluginKey>([listStartsKey, pageDebugKey, pageVariablesKey]);
const onPages = (plugin: Plugin) => ON_PAGES.has(plugin.spec.key as PluginKey);

type PagingSetup = Omit<
  PagedProjectionOptions,
  'state' | 'plugins' | 'dispatch' | 'onProjection' | 'onLayout'
> & { readonly onLayoutStateChange: (state: LayoutState) => void };
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
  // A projection stopped shows nothing more, as the view drawing its last pages goes after it.
  let live = true;
  const show = (paged: PagedEditor | null) => {
    if (live) setPaged(paged);
  };
  const projection = startProjection(setup, latest, {
    own: ownPlugins.current,
    pages,
    setPaged: show,
  });
  active.current = projection;
  // The pages were just measured with what the editor's effects refresh them for as it mounts, so
  // only a later change measures them again.
  queueMicrotask(() => {
    if (active.current === projection)
      refresh.current = () => projection.refresh({ remeasure: true });
  });
  redraw.current = (key) => projection.redraw(key);
  return () => {
    refresh.current = null;
    redraw.current = null;
    active.current = null;
    setPaged(null);
    live = false;
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
    // The pages render in a plain view (DOCE-EDITOR-1.8), which keeps no React node identities.
    plugins: [...pages],
    // The ghost takes no React keys of the engine's: it keys the states it renders itself.
    ghostPlugins: withOwn(
      withoutReactKeys(latest.current.state).plugins.filter((plugin) => !pages.includes(plugin)),
      own,
    ),
    mountGhost: ghostWith(latest),
    // The engine's own border resize runs on the pages, on the whole table.
    resizeColumns: false,
    dispatch: (tr, change) => latest.current.onCanonical?.(tr, change),
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

// How the ghost mounts: with the host's React node views, which it renders as the pages do, under
// the providers the editor's own views read, so a block they draw is measured as it shows; a plain
// view without them. The node views are those the pages mount with: a host that swaps them has the
// ghost keep the old ones until the pages mount again.
function ghostWith(
  latest: RefObject<DocumentLayoutOptions>,
): ((element: HTMLElement, options: MeasuringViewOptions) => MeasuringView) | undefined {
  const { nodeViews } = latest.current;
  if (!nodeViews || Object.keys(nodeViews).length === 0) return undefined;
  return (element, { state }) => {
    const mounted = mountRichTextView(element, {
      state,
      nodeViews,
      wrap: (shown) => latest.current.wrapGhost?.(shown) ?? shown,
    });
    return {
      view: mounted.view,
      show: (next) => mounted.update(next),
      destroy: () => mounted.destroy(),
    };
  };
}

// Starts something once React has left the commit it was asked in, as a projection whose ghost
// mounts a React root of its own, drawn at once, which React cannot do inside an effect; returns
// how to stop it, started or not.
function afterCommit(start: () => () => void): () => void {
  let stop: (() => void) | null = null;
  let cancelled = false;
  queueMicrotask(() => {
    if (!cancelled) stop = start();
  });
  return () => {
    cancelled = true;
    stop?.();
  };
}
