// The paged projection (PG-40): the canonical state holds the whole document, each section on one
// page with whole blocks, and takes every edit and the undo history. A projection state shows it
// on pages, and a hidden ghost view renders the canonical document to measure them. The
// projection's document changes only by a layout or by a canonical change mirrored onto it: any
// other change is input, routed to the canonical state, or refused. Canonical changes reach the
// projection at once, step by step; the pages are laid out again once the writer pauses.
//
// Whatever renders the projection, a view of its own (`createProjectionView`) or the editor's
// engine, renders `projection` with the `plugins` it carries, passes each of its transactions to
// `receive`, and takes each new projection state from `onProjection`.

import type { Slice } from 'prosemirror-model';
import {
  type Command,
  EditorState,
  Plugin,
  type PluginKey,
  type Transaction,
} from 'prosemirror-state';
import { columnResizing } from 'prosemirror-tables';
import type { EditorProps, EditorView } from 'prosemirror-view';
import { FRAGMENT_RULES, type FragmentRules } from '../model/index.js';
import { canonicalDecorations } from './canonical-decorations.js';
import {
  canonicalKeys,
  canonicalPaste,
  canonicalPlugins,
  type CanonicalPluginsSource,
  canonicalViewOf,
} from './canonical-plugins.js';
import { holdCellSelection } from './cell-drag.js';
import { type MeasuringView, type MeasuringViewOptions, mountMeasuringView } from './ghost-view.js';
import {
  createLayoutMemory,
  type SectionLayoutRules,
  type SectionPageHeight,
} from './layout-document.js';
import { createLayoutReadiness, type LayoutState } from './layout-readiness.js';
import {
  awaitReady,
  forgetRemeasured,
  frameIn,
  remeasureOn,
  settleEdits,
} from './layout-triggers.js';
import { createMeasureCache } from './measure-blocks.js';
import { createPaginationCounter, type PaginationStats } from './pagination-stats.js';
import { canonicalCellAt, projectionKeys } from './projection-input.js';
import { createProjectionMap, type ProjectionMap } from './projection-map.js';
import {
  dispatchCanonical,
  layout,
  moveAcrossBreak,
  prepare,
  quietly,
  receive,
  refreshLayout,
  replug,
  requestLayout,
  runCommand,
  send,
  type Session,
  showCanonical,
  take,
} from './projection-session.js';
import { cellSelectionDecorations } from './selection-mirror.js';

/** How a paged projection is set up. */
export interface PagedProjectionOptions {
  /** Where the ghost view that measures mounts, laid out as a page's content. */
  readonly measureIn: HTMLElement;
  /** The canonical state: the whole document, each section on one page with whole blocks. */
  readonly state: EditorState;
  readonly pageHeight: SectionPageHeight;
  readonly rules?: SectionLayoutRules | undefined;
  readonly fragmentRules?: FragmentRules | undefined;
  readonly footnoteNumbering?: 'document' | 'page' | undefined;
  /** The node views the ghost renders with, as the projection does. */
  readonly nodeViews?: EditorProps['nodeViews'];
  /**
   * Mounts the ghost in `measureIn`, such as with the host's React node views, so it measures the
   * blocks as the pages draw them; by default a plain view with `nodeViews` (`mountMeasuringView`).
   */
  readonly mountGhost?:
    ((element: HTMLElement, options: MeasuringViewOptions) => MeasuringView) | undefined;
  /** Plugins that change what the document renders, run on the projection and the ghost. */
  readonly plugins?: readonly Plugin[] | undefined;
  /**
   * Whether the pages resize a table's columns by its borders, setting the column of the whole
   * table (`columnResizing`); true by default. A host whose canonical plugins resize columns
   * themselves, run through the pages (DOCE-PAGINATION-7.15), turns it off.
   */
  readonly resizeColumns?: boolean | undefined;
  /**
   * Plugins only the ghost runs, beside `plugins`: the canonical state's plugins that change what
   * takes room, such as changes marked in place, whose decorations the projection draws already.
   */
  readonly ghostPlugins?: readonly Plugin[] | undefined;
  /** Commands on the canonical state by key, beside Enter, Backspace and Delete. */
  readonly keys?: Readonly<Record<string, Command>> | undefined;
  /**
   * Receives each canonical transaction the projection's input makes, already applied to `state`.
   * A host that holds the canonical state applies it too, and hands the result to `update`.
   */
  readonly dispatch?: ((tr: Transaction) => void) | undefined;
  /** Receives each new projection state, for whatever renders it. */
  readonly onProjection: (state: EditorState) => void;
  /** Milliseconds without an edit before the pages are laid out again; 150 by default. */
  readonly settle?: number | undefined;
  /** Runs a layout soon and returns how to cancel it; by default on the next animation frame. */
  readonly schedule?: ((run: () => void) => () => void) | undefined;
  /**
   * Called after each layout with the projection transaction that moved onto the new pages,
   * marked as a pagination's (`isPaginationTransaction`, `layoutStats`).
   */
  readonly onLayout?: ((tr: Transaction) => void) | undefined;
  /** Tells of each change of the layout state (`PagedProjection.layoutState`). */
  readonly onLayoutStateChange?: ((state: LayoutState) => void) | undefined;
  /**
   * Settles once what the pages measure with is loaded, such as the template's fonts: the pages
   * are laid out at once, measured again then, and pending until it settles (DOCE-PAGINATION-5.6).
   */
  readonly ready?: PromiseLike<unknown> | undefined;
}

/** What a projection has done since it was made: what its layouts did, as a pagination's. */
export interface ProjectionStats extends PaginationStats {
  /** Projection edits refused, as a step did not map onto the canonical state. */
  readonly refused: number;
  /** Canonical changes that could not be mirrored, after which the pages were laid out at once. */
  readonly relaid: number;
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
   * Lays the pages out again soon. `remeasure` forgets every measurement and starts the ghost's
   * plugins over, as after a width change or a change to a value a plugin shows.
   */
  refresh(options?: { readonly remeasure?: boolean }): void;
  /** Whether the pages are being laid out, are settled, or could not be laid out. */
  layoutState(): LayoutState;
  /** Resolves with `settled` or `failed` once no layout is pending. */
  whenSettled(): Promise<LayoutState>;
  stats(): ProjectionStats;
  destroy(): void;
}

// The projection's own plugin: keys and paste run on the canonical state, and a press may start a
// cell selection across the parts of a split table.
function inputPlugin(session: () => Session, source: CanonicalPluginsSource): Plugin {
  let keys: ReturnType<typeof projectionKeys> | null = null;
  const delegated = canonicalKeys(source);
  const pasted = canonicalPaste(source);
  return new Plugin({
    props: {
      handleKeyDown(view, event) {
        if (view.composing || event.isComposing) return false;
        keys ??= projectionKeys({
          keys: session().options.keys,
          run: (command) => runCommand(session(), command),
          across: (move) => moveAcrossBreak(session(), move),
          delegate: (pressed) => delegated(view, pressed),
        });
        const handled = keys(view, event);
        const arrow = !event.shiftKey && event.key.startsWith('Arrow');
        if (!handled && arrow) session().cells.release();
        return handled;
      },
      handlePaste: (view, event, slice: Slice) =>
        pasted(view, event, slice) ||
        runCommand(session(), (state, dispatch) => {
          dispatch?.(state.tr.replaceSelection(slice).scrollIntoView());
          return true;
        }),
      handleDOMEvents: {
        mousedown(view, event) {
          const current = session();
          current.cells.release();
          current.cells.drag(view, event, {
            cellAt: (moved) => canonicalCellAt(view, current, moved),
            canonical: () => current.canonical,
            select(tr) {
              send(current, tr);
              take(current, current.projection.tr);
            },
          });
          return false;
        },
      },
    },
  });
}

// What the canonical plugins run on: the session's canonical state, map and dispatch.
function sourceOf(session: () => Session): CanonicalPluginsSource {
  return {
    canonical: () => session().canonical,
    map: () => session().map,
    dispatch: (tr) => dispatchCanonical(session(), tr),
    prepare: () => prepare(session()),
  };
}

// The projection's first state: the canonical document, with the plugins that route input to the
// canonical state and draw what it draws, and the host's.
function projectionState(options: PagedProjectionOptions, session: () => Session): EditorState {
  const source = sourceOf(session);
  return EditorState.create({
    doc: options.state.doc,
    plugins: [
      inputPlugin(session, source),
      canonicalPlugins(source),
      cellSelectionDecorations({
        selection: () => session().canonical.selection,
        map: () => session().map,
      }),
      canonicalDecorations(source),
      ...(options.resizeColumns === false ? [] : [columnResizing({ View: null })]),
      ...(options.plugins ?? []),
    ],
  });
}

// The session of a new projection: the ghost, the pace of its layouts, and the first states.
function startSession(options: PagedProjectionOptions, session: () => Session): Session {
  const rules = options.fragmentRules ?? FRAGMENT_RULES;
  const schedule = options.schedule ?? frameIn(options.measureIn);
  const cache = createMeasureCache();
  const mount = options.mountGhost ?? mountMeasuringView;
  const ghost = mount(options.measureIn, {
    state: EditorState.create({
      doc: options.state.doc,
      plugins: [...(options.plugins ?? []), ...(options.ghostPlugins ?? [])],
    }),
    nodeViews: options.nodeViews,
  });
  return {
    options,
    rules,
    cache,
    cells: holdCellSelection(),
    counts: { refused: 0, relaid: 0 },
    ghost,
    edits: settleEdits(options, () => requestLayout(session())),
    pace: {
      counter: createPaginationCounter(cache),
      readiness: createLayoutReadiness({ schedule, onChange: options.onLayoutStateChange }),
      changed: true,
      passes: 0,
      restart: false,
      memory: createLayoutMemory(),
      ready: awaitReady(options.ready, () => refreshLayout(session(), true)),
    },
    canonical: options.state,
    projection: projectionState(options, session),
    shown: options.state.doc,
    map: createProjectionMap(options.state.doc, rules),
    view: null,
    cancelLayout: null,
    quiet: 0,
  };
}

// What the projection's measuring asks: measure the blocks that changed size again, and lay out.
function remeasureGhost(live: Session): () => void {
  return remeasureOn(live.options.measureIn, (change) => {
    forgetRemeasured(live.cache, live.ghost.view, change);
    requestLayout(live);
  });
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
  const unlisten = remeasureGhost(live);
  layout(live);
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
    attach(view) {
      live.view = view;
      const unwatch = live.edits.watch(view);
      return () => {
        unwatch();
        if (live.view === view) live.view = null;
      };
    },
    receive: (tr) => receive(live, tr),
    update(state, tr) {
      // A projection gone keeps what it last showed, as a renderer may still hold it.
      if (state === live.canonical || live.ghost.view.isDestroyed) return;
      const replugged = state.plugins !== live.canonical.plugins;
      live.canonical = state;
      if (replugged) replug(live);
      quietly(live, () => showCanonical(live, tr ?? null));
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
    refresh: ({ remeasure = false } = {}) => refreshLayout(live, remeasure),
    layoutState: live.pace.readiness.state,
    whenSettled: live.pace.readiness.whenSettled,
    stats: () => ({ ...live.pace.counter.stats(), ...live.counts }),
    destroy() {
      unlisten();
      live.cancelLayout?.();
      live.edits.cancel();
      live.pace.readiness.destroy();
      live.ghost.destroy();
    },
  };
}
