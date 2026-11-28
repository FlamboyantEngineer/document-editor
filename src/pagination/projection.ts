// The paged projection (PG-40): the canonical state holds the whole document, each section on one
// page with whole blocks, and takes every edit and the undo history. A projection state shows it
// on pages, laid out by the layout engine from the canonical document, with no DOM read. The
// projection's document changes only by a layout or by a canonical change mirrored onto it: any
// other change is input, routed to the canonical state, or refused. Canonical changes reach the
// projection at once, step by step; the pages are laid out again once the writer pauses.
//
// Whatever renders the projection, a view of its own (`createProjectionView`) or the editor's
// engine, renders `projection` with the `plugins` it carries, passes each of its transactions to
// `receive`, and takes each new projection state from `onProjection`.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import {
  type Command,
  EditorState,
  type Plugin,
  type PluginKey,
  type Transaction,
} from 'prosemirror-state';
import { columnResizing } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import type { PagesLayout } from '../document/pages-layout.js';
import { withFootnoteNumbers } from '../engine/footnote-numbers.js';
import { typesetMathOf } from '../engine/math-views.js';
import type { FontFiles } from '../host/font-files.js';
import { FRAGMENT_RULES, type FragmentRules } from '../model/index.js';
import type { CanonicalChange, CanonicalTaken } from './canonical-change.js';
import { canonicalDecorations } from './canonical-decorations.js';
import {
  canonicalPlugins,
  type CanonicalPluginsSource,
  canonicalViewOf,
} from './canonical-plugins.js';
import { takeCaretBefore } from './caret.js';
import { holdCellSelection } from './cell-drag.js';
import { forcedLinesKey } from './forced-lines.js';
import {
  createLayoutMemory,
  type SectionLayoutRules,
  type SectionPageHeight,
} from './layout-document.js';
import { shownBy } from './layout-latency.js';
import { createLayoutReadiness, type LayoutState } from './layout-readiness.js';
import type { LayoutTraceSink } from './layout-trace.js';
import { awaitLayoutInputs, frameIn, settleEdits } from './layout-triggers.js';
import { checkDrawnPages, checkDraws } from './layout-validation.js';
import { pageChromeDecorations } from './page-chrome.js';
import { createPageMapScope } from './page-map.js';
import { layoutSettled, pagesLayout } from './pages-layout.js';
import { createPaginationCounter, type PaginationStats } from './pagination-stats.js';
import { bindProjectionView } from './projection-attachment.js';
import { inputPlugin } from './projection-input-plugin.js';
import { createProjectionMap, type ProjectionMap } from './projection-map.js';
import {
  dispatchCanonical,
  layout,
  prepare,
  quietly,
  receive,
  refreshLayout,
  replug,
  requestLayout,
  runCommand,
  type Session,
  settleTyping,
  showCanonical,
  showsNewerSelection,
  take,
} from './projection-session.js';
import { cellSelectionDecorations } from './selection-mirror.js';
import { recheckFonts, typedPages } from './session-hooks.js';
import { splitBreaksPlugin } from './split-breaks.js';
import {
  holdTextEngine,
  type TextEngineHolder,
  type TextLayoutSetting,
} from './text-engine-holder.js';
import type { TextEngineStats } from './text-engine-types.js';
import { textLayoutPlugins } from './text-layout-plugins.js';
import { type PageTextLines, pageTextLines } from './text-lines.js';
import { createTypingProbe } from './typing-probe.js';

/** How a paged projection is set up. */
export interface PagedProjectionOptions {
  /**
   * An element of the document the pages show in: its window schedules the layouts and times the
   * pause after typing, and its fonts tell when the pages are settled.
   */
  readonly element: HTMLElement;
  /** The canonical state: the whole document, each section on one page with whole blocks. */
  readonly state: EditorState;
  readonly pageHeight: SectionPageHeight;
  readonly rules?: SectionLayoutRules | undefined;
  readonly fragmentRules?: FragmentRules | undefined;
  readonly footnoteNumbering?: 'document' | 'page' | undefined;
  /**
   * Plugins that change what the document renders, run on the projection and on the state the
   * pages are laid out from.
   */
  readonly plugins?: readonly Plugin[] | undefined;
  /**
   * Whether the pages resize a table's columns by its borders, setting the column of the whole
   * table (`columnResizing`); true by default. A host whose canonical plugins resize columns
   * themselves, run through the pages (DOCE-PAGINATION-7.15), turns it off.
   */
  readonly resizeColumns?: boolean | undefined;
  /**
   * Plugins only the state the pages are laid out from runs, beside `plugins`: the canonical
   * state's plugins that change what takes room, such as changes marked in place, whose
   * decorations the projection draws already. That state has no view, so their plugin views do not
   * run there (DOCE-PAGINATION-7.17).
   */
  readonly layoutPlugins?: readonly Plugin[] | undefined;
  /** Commands on the canonical state by key, beside Enter, Backspace and Delete. */
  readonly keys?: Readonly<Record<string, Command>> | undefined;
  /**
   * Receives each canonical transaction the projection's input makes, already applied to `state`,
   * with the canonical state it was applied to and the one it made, the transactions the plugins
   * appended included. A host that holds the canonical state takes it too, as that state when it
   * still holds the one it was applied to (DOCE-PAGINATION-7.19), and hands the result to `update`.
   * A host that takes another transaction in its place, on the same state, such as one rewritten
   * as a suggestion, gives what that transaction made, which the canonical state then holds
   * instead (DOCE-PAGINATION-7.26).
   */
  readonly dispatch?:
    ((tr: Transaction, made: CanonicalChange) => CanonicalTaken | void) | undefined;
  /** Receives each new projection state, for whatever renders it. */
  readonly onProjection: (state: EditorState) => void;
  /** Milliseconds without an edit before the pages are laid out again; 150 by default. */
  readonly settle?: number | undefined;
  /** Runs a layout soon and returns how to cancel it; by default on the next animation frame. */
  readonly schedule?: ((run: () => void) => () => void) | undefined;
  /**
   * Called after each layout with the projection transaction that moved onto the new pages,
   * marked as a layout's (`isPaginationTransaction`, `layoutStats`).
   */
  readonly onLayout?: ((tr: Transaction) => void) | undefined;
  /** Tells of each change of the layout state (`PagedProjection.layoutState`). */
  readonly onLayoutStateChange?: ((state: LayoutState) => void) | undefined;
  /**
   * Settles once what the pages measure with is loaded, such as the template's fonts: the pages
   * are laid out at once, measured again then, and pending until it settles (DOCE-PAGINATION-5.6).
   */
  readonly ready?: PromiseLike<unknown> | undefined;
  /** Whether the current template is waiting for served faces while drawing in fallback fonts. */
  readonly fontsPending?: (() => boolean) | undefined;
  /** Where the layout's trace goes while it is read (`LayoutTrace`); nothing is written otherwise. */
  readonly trace?: LayoutTraceSink | undefined;
  /**
   * Whether to count, after each layout drawn, the pages drawn taller than they are
   * (`overflowPages`, DOCE-PAGINATION-5.9), reading each drawn page's box: for tests and debugging.
   */
  readonly overflow?: (() => boolean) | undefined;
  /**
   * Lays the pages out with the layout engine, which it loads, and draws its lines on the pages
   * (DOCE-PAGINATION-11). Without it or `textEngine` the pages are not laid out: nothing is
   * measured in the DOM.
   */
  readonly textLayout?: TextLayoutSetting | undefined;
  /** A layout engine already held, in place of the one `textLayout` loads, as tests hold one. */
  readonly textEngine?: TextEngineHolder | undefined;
}

/** What a projection has done since it was made: what its layouts did. */
export interface ProjectionStats extends PaginationStats {
  /** Projection edits refused, as a step did not map onto the canonical state. */
  readonly refused: number;
  /** Canonical changes that could not be mirrored, after which the pages were laid out at once. */
  readonly relaid: number;
  /** With `textLayout`, the blocks the engine laid out and those it left to the DOM, and why. */
  readonly textLayout?: TextEngineStats | undefined;
}

/** A paged projection of a canonical state. */
export interface PagedProjection {
  /** The canonical state as the projection shows it. */
  readonly state: EditorState;
  /** The projection's state: the pages. */
  readonly projection: EditorState;
  /** The positions between the projection and the canonical document. */
  readonly map: ProjectionMap;
  /** Has a view that renders the projection read the DOM before input; returns how to stop. */
  attach(view: EditorView): () => void;
  /** Takes a transaction of the projection's state, as its view dispatches it. */
  receive(tr: Transaction): void;
  /** Shows a new canonical state; `tr`, when it made the state, is mirrored step by step. */
  update(state: EditorState, tr?: Transaction): void;
  /** Runs a command on the canonical state, with the projection's selection mirrored there first. */
  run(command: Command): boolean;
  /** Takes a transaction of the canonical state as it stands, and shows it on the pages at once. */
  dispatch(tr: Transaction): void;
  /**
   * A view that renders the projection, as a view of the canonical state (`canonicalView`), the
   * same one the canonical plugins run on.
   */
  canonicalView(view: EditorView): EditorView;
  /** Lays the pages out now. */
  layout(): void;
  /**
   * Has the projection's own plugins of these keys draw the pages again, as after a value they
   * show changed, with no change to the pages.
   */
  redraw(...keys: readonly PluginKey[]): void;
  /**
   * With the layout engine, draws every page on its lines, as for a snapshot of the pages, or puts
   * back only the pages near the screen (DOCE-PAGINATION-11.6).
   */
  drawAllLines(all: boolean): void;
  /**
   * Lays the pages out again soon. `remeasure` forgets every measurement and starts the plugins of
   * the state the pages are laid out from over, as after a width change or a change to a value a plugin shows.
   */
  refresh(options?: { readonly remeasure?: boolean }): void;
  /**
   * The served fonts started or stopped being pending (`fontsPending`): the pages are pending and
   * settle once nothing is due, laid out again only when a change waits for a layout.
   */
  fontsChanged(): void;
  /** Whether the pages are being laid out, are settled, or could not be laid out. */
  layoutState(): LayoutState;
  /** Resolves with `settled` or `failed` once no layout is pending. */
  whenSettled(): Promise<LayoutState>;
  stats(): ProjectionStats;
  /** With `textLayout`, the lines the pages draw their top-level text blocks on, page by page. */
  textLines(): PageTextLines[];
  /** With `textLayout`, the pages' layout as data a viewer or a print draws (`pagesLayout`). */
  pagesLayout(): PagesLayout | null;
  /** With `textLayout`, the served faces the pages are measured and drawn with; null without. */
  servedFonts(): FontFiles | null;
  destroy(): void;
}

// What the canonical plugins run on: the session's canonical state, map and dispatch.
function sourceOf(session: () => Session): CanonicalPluginsSource {
  return {
    canonical: () => session().canonical,
    map: () => session().map,
    rules: () => session().rules,
    dispatch: (tr) => dispatchCanonical(session(), tr),
    prepare: (options) => prepare(session(), options),
  };
}

// The projection's first state: the canonical document and selection, with the plugins that route input to the
// canonical state and draw what it draws, and the host's.
function projectionState(
  options: PagedProjectionOptions,
  session: () => Session,
  { text, firstMap }: { text: TextEngineHolder | null; firstMap: ProjectionMap },
): EditorState {
  const source = sourceOf(session);
  // A plugin made with an engine already held reads the map as the state is made, before the
  // session holds it.
  let making = true;
  const map = () => (making ? firstMap : source.map());
  const state = EditorState.create({
    doc: options.state.doc,
    selection: options.state.selection,
    plugins: [
      inputPlugin(session, source),
      canonicalPlugins(source),
      cellSelectionDecorations({
        selection: () => session().canonical.selection,
        map: () => session().map,
      }),
      canonicalDecorations({
        ...source,
        pages: () => session().pageMaps.read(session().canonical),
      }),
      pageChromeDecorations(),
      splitBreaksPlugin(),
      ...(text
        ? textLayoutPlugins(text, {
            map,
            redraw: () => take(session(), session().projection.tr.setMeta(forcedLinesKey, true)),
          })
        : []),
      checkDrawnPages(() => session().pace.draws, takeCaretBefore),
      ...(options.resizeColumns === false ? [] : [columnResizing({ View: null })]),
      // The pages number their own footnotes, through the document or on each page.
      ...withFootnoteNumbers(options.plugins ?? [], options.footnoteNumbering),
    ],
  });
  making = false;
  return state;
}

// The session of a new projection: the state the pages are laid out from, the pace of its layouts,
// and the first states.
function startSession(options: PagedProjectionOptions, session: () => Session): Session {
  const rules = options.fragmentRules ?? FRAGMENT_RULES;
  const schedule = options.schedule ?? frameIn(options.element);
  const holding = { changed: () => requestLayout(session()), state: () => session().source };
  const text =
    options.textEngine ??
    (options.textLayout ? holdTextEngine({ setting: options.textLayout, ...holding }) : null);
  const source = EditorState.create({
    doc: options.state.doc,
    // Footnotes numbered through the document: the measured document has no pages to number by.
    plugins: withFootnoteNumbers([...(options.plugins ?? []), ...(options.layoutPlugins ?? [])]),
  });
  const map = createProjectionMap(options.state.doc, rules);
  return {
    options,
    rules,
    pageMaps: createPageMapScope(),
    cells: holdCellSelection(),
    counts: { refused: 0, relaid: 0 },
    source,
    destroyed: false,
    edits: settleEdits(options, () => settleTyping(session())),
    probe: createTypingProbe(options.element, {
      pages: () => typedPages(session()),
      moved: () => requestLayout(session()),
      schedule: options.schedule,
    }),
    pace: {
      counter: createPaginationCounter(() => session().pace.text?.engine()?.stats().laid ?? 0),
      readiness: createLayoutReadiness({ schedule, onChange: options.onLayoutStateChange }),
      changed: true,
      passes: 0,
      restart: false,
      memory: createLayoutMemory(),
      ready: awaitLayoutInputs(text, options.ready, {
        settled: () => refreshLayout(session(), true),
        failed: () => session().pace.readiness.fail(),
      }),
      text,
      draws: checkDraws({
        overflow: options.overflow,
        count: (pages) => session().pace.counter.overflow(pages),
      }),
    },
    canonical: options.state,
    projection: projectionState(options, session, { text, firstMap: map }),
    shown: options.state.doc,
    map,
    view: null,
    cancelLayout: null,
    quiet: 0,
  };
}

/** Lays a canonical state out on pages, routing input on them back to it. */
export function createPagedProjection(options: PagedProjectionOptions): PagedProjection {
  // The plugins' handlers run only once the session holds them.
  let current: Session | null = null;
  const session = (): Session => {
    if (!current) throw new Error('The projection is not made yet.');
    return current;
  };
  const live = startSession(options, session);
  current = live;
  layout(live);
  const mounted = bindProjectionView(live);
  return {
    get state() {
      return live.canonical;
    },
    get projection() {
      return live.projection;
    },
    get map() {
      return live.map;
    },
    attach: mounted.attach,
    receive: (tr) => receive(live, tr),
    update(state, tr) {
      // A projection gone keeps what it last showed, as a renderer may still hold it.
      if (state === live.canonical || live.destroyed) return;
      const replugged = state.plugins !== live.canonical.plugins;
      live.canonical = state;
      if (replugged) replug(live);
      if (state.doc === live.shown && showsNewerSelection(live)) return;
      quietly(live, () => showCanonical(live, tr ?? null, shownBy(tr ? [tr] : [])));
    },
    run: (command) => runCommand(live, command),
    dispatch: (tr) => dispatchCanonical(live, tr),
    canonicalView: (view) => canonicalViewOf(view, sourceOf(session)),
    layout: () => layout(live),
    redraw(...keys) {
      const tr = live.projection.tr.setMeta('addToHistory', false);
      for (const key of keys) tr.setMeta(key, true);
      take(live, tr);
    },
    drawAllLines(all) {
      if (live.pace.text) take(live, live.projection.tr.setMeta(forcedLinesKey, { drawAll: all }));
    },
    refresh: ({ remeasure = false } = {}) => refreshLayout(live, remeasure),
    fontsChanged: () => recheckFonts(live),
    layoutState: live.pace.readiness.state,
    whenSettled: live.pace.readiness.whenSettled,
    stats: () => ({
      ...live.pace.counter.stats(),
      ...live.counts,
      ...(live.pace.text ? { textLayout: live.pace.text.engine()?.stats() } : {}),
    }),
    textLines: () => pageTextLines(live.projection),
    pagesLayout: () => {
      const state = live.pace.readiness.state();
      const settled = options.fontsPending
        ? state === 'settled' && !options.fontsPending()
        : layoutSettled(state, options.element);
      const markup = options.textLayout?.markup?.() ?? 'all';
      const typesetOf = (node: ProseMirrorNode) => typesetMathOf(live.canonical, node);
      return pagesLayout(live.projection, { ...options, settled, markup, typesetOf });
    },
    servedFonts: () => live.pace.text?.engine()?.fonts?.() ?? null,
    destroy() {
      live.destroyed = true;
      mounted.detach();
      live.cells.release();
      live.cancelLayout?.();
      live.edits.cancel();
      live.pace.readiness.destroy();
      live.probe.stop();
      live.pace.text?.destroy();
    },
  };
}
