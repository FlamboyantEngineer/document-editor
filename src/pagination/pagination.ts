// Keeps an editor's pages laid out. A hidden view renders the whole document, each section on one
// page with whole blocks, and follows the editor's document by the smallest replacement, so only
// changed blocks render and measure again. After a change the pages are laid out from it, and the
// editor is stepped onto them outside the undo history.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { type EditorProps, EditorView } from 'prosemirror-view';
import {
  FRAGMENT_RULES,
  type FragmentRules,
  joinDocumentPages,
  projectDocument,
  repaginate,
} from '../model/index.js';
import { readDomSelection } from '../utils/dom-selection.js';
import { footnoteAnchor, restoreFootnoteSelection } from './footnote-selection.js';
import { type DocumentLayoutOptions, layoutDocument, type PageMetric } from './layout-document.js';
import { createLayoutReadiness, type LayoutState } from './layout-readiness.js';
import { remeasureOn, settleEdits } from './layout-triggers.js';
import { createMeasureCache, type MeasureCache } from './measure-blocks.js';
import { createPaginationCounter, type PaginationStats } from './pagination-stats.js';

/** How an editor's pages are kept laid out. */
export interface PaginationOptions extends Omit<DocumentLayoutOptions, 'scale' | 'cache'> {
  /**
   * Where the hidden view that measures the document mounts. Blocks must lay out there as in a
   * page's content: at its width, with its styles; the footnote area likewise.
   */
  measureIn: HTMLElement;
  /** The node views the editor renders with, so blocks measure as they show. */
  nodeViews?: EditorProps['nodeViews'];
  /** Plugins that change what the editor renders, such as page variables, for the same reason. */
  plugins?: readonly Plugin[] | undefined;
  fragmentRules?: FragmentRules | undefined;
  /** How much the editor is scaled on screen, such as by a zoom. */
  scale?: (() => number) | undefined;
  /** Runs a layout soon and returns how to cancel it; by default on the next animation frame. */
  schedule?: ((run: () => void) => () => void) | undefined;
  /**
   * Milliseconds without a further edit before the pages are laid out after one, so a writer
   * typing is not slowed by a layout per key; never more than four times as long after the first
   * edit. Defaults to 150; 0 lays out after every edit.
   */
  settle?: number | undefined;
  /** Tells of each change of the layout state (`Pagination.layoutState`). */
  onLayoutStateChange?: ((state: LayoutState) => void) | undefined;
}

/** An editor's pagination: its plugin, and a way to lay the pages out again. */
export interface Pagination {
  readonly plugin: Plugin<boolean>;
  /**
   * Lays the pages out again. `remeasure` forgets every measurement and starts the measuring view's
   * plugins over, as after a width change or a change to a value a plugin shows.
   */
  refresh(options?: { remeasure?: boolean }): void;
  /**
   * Whether the pages are being laid out (`pending`), are laid out with no layout due and drawn
   * (`settled`), or could not be laid out (`failed`): a layout threw, or layouts kept moving the
   * pages with no change in between.
   */
  layoutState(): LayoutState;
  /** Resolves with `settled` or `failed` once no layout is pending. */
  whenSettled(): Promise<LayoutState>;
  /** What the layouts have done since the pagination was made. */
  stats(): PaginationStats;
}

/** Marks the transactions that move an editor onto new pages; its state says a layout is due. */
export const paginationKey = new PluginKey<boolean>('pagination');

// What the layouts had done, on the transaction a layout moves the editor with.
const statsKey = new PluginKey<PaginationStats>('pagination-stats');

// How many layouts in a row may move the pages with no change in between before the layout counts
// as not converging: a list of contents taking its page numbers takes one more, and an image
// loading another.
const LAYOUT_PASSES = 8;

// The pages each laid-out document was laid out as, in order.
const laidOut = new WeakMap<ProseMirrorNode, readonly PageMetric[]>();

/**
 * How the pages of the document a state shows were laid out, in order: what their blocks take of
 * the height they have. None until a layout, and after a change until the next one.
 */
export function pageMetrics(state: EditorState): readonly PageMetric[] | null {
  return laidOut.get(state.doc) ?? null;
}

/** Whether a transaction moved the editor onto new pages, rather than changing its content. */
export function isPaginationTransaction(tr: Transaction): boolean {
  return tr.getMeta(paginationKey) === true;
}

/**
 * What its pagination's layouts had done (`Pagination.stats`) when a transaction moved the editor
 * onto new pages; null for any other transaction.
 */
export function layoutStats(tr: Transaction): PaginationStats | null {
  return (tr.getMeta(statsKey) as PaginationStats | undefined) ?? null;
}

function frame(run: () => void): () => void {
  const handle = requestAnimationFrame(run);
  return () => cancelAnimationFrame(handle);
}

// Moves the measuring view onto the whole document by the smallest replacement, so the blocks
// around the change keep their nodes, their rendering and their cached measurements.
function follow(measuring: EditorView, whole: ProseMirrorNode): void {
  const { state } = measuring;
  const current = state.doc;
  const start = current.content.findDiffStart(whole.content);
  if (start === null) return;
  const end = current.content.findDiffEnd(whole.content);
  let endA = end?.a ?? current.content.size;
  let endB = end?.b ?? whole.content.size;
  const overlap = start - Math.min(endA, endB);
  if (overlap > 0) {
    endA += overlap;
    endB += overlap;
  }
  const tr = state.tr.replace(start, endA, whole.slice(start, endB));
  const next = tr.doc.eq(whole)
    ? state.apply(tr)
    : EditorState.create({ doc: whole, plugins: state.plugins });
  measuring.updateState(next);
}

interface Runner {
  editor: EditorView | null;
  measuring: EditorView | null;
  cancel: (() => void) | null;
  /** Whether the measuring view's plugins start over, as after a value they show changed. */
  restart: boolean;
  /** Whether a change came, or the host asked for a layout, since the latest layout. */
  changed: boolean;
  /** The layouts in a row that moved the pages with no change in between. */
  passes: number;
}

// Lays the measuring view's document out on pages, with what each page's blocks take of it.
function layOutPages(measuring: EditorView, options: PaginationOptions, counter: LayoutCounter) {
  const metrics: PageMetric[] = [];
  const sections = layoutDocument(measuring, {
    ...options,
    scale: options.scale?.(),
    cache: counter.cache,
    onPage: (page) => metrics.push(page),
    onSection: counter.section,
  });
  return { sections, metrics };
}

// A runner with no editor mounted.
const unmounted = { editor: null, measuring: null, cancel: null, restart: false } as const;

// What a layout counts with: the measure cache, and the pagination's counters.
type LayoutCounter = { readonly cache: MeasureCache } & ReturnType<typeof createPaginationCounter>;

// The options a layout reads, with the fragment rules settled.
type LayoutContext = PaginationOptions & { readonly fragmentRules: FragmentRules };

// The hidden view that renders the whole document to measure it, as the editor renders it.
const measuringView = (options: PaginationOptions, doc: ProseMirrorNode): EditorView =>
  new EditorView(options.measureIn, {
    state: EditorState.create({ doc, plugins: [...(options.plugins ?? [])] }),
    editable: () => false,
    nodeViews: options.nodeViews ?? {},
  });

// Steps the editor onto the pages laid out from its whole document, counting what the layout did.
function stepOntoPages(
  { editor, measuring }: { readonly editor: EditorView; readonly measuring: EditorView },
  options: LayoutContext,
  counter: LayoutCounter,
): Transaction {
  const { sections, metrics } = layOutPages(measuring, options, counter);
  const { state } = editor;
  const target = projectDocument(measuring.state.doc, sections, options);
  const tr = state.tr;
  repaginate(tr, target, options.fragmentRules);
  restoreFootnoteSelection(tr, footnoteAnchor(state));
  laidOut.set(tr.doc, metrics);
  counter.layout(state.doc, tr.doc);
  tr.setMeta(statsKey, counter.stats());
  editor.dispatch(tr.setMeta(paginationKey, true).setMeta('addToHistory', false));
  return tr;
}

// The pagination plugin: it says whether a layout is due, and asks for one after each change, at
// once for a transaction that leaves the content as it was.
function paginationPlugin(
  runner: Runner,
  on: {
    readonly mount: (editor: EditorView) => () => void;
    readonly changed: () => void;
    readonly request: () => void;
  },
  fragmentRules: FragmentRules,
): Plugin<boolean> {
  return new Plugin<boolean>({
    key: paginationKey,
    // The rules its pages join by, for the page map of the document it keeps paged (`pageMap`).
    fragmentRules,
    state: {
      init: () => true,
      apply: (tr, due) => (isPaginationTransaction(tr) ? false : due || tr.docChanged),
    },
    view(editor) {
      runner.editor = editor;
      const unmount = on.mount(editor);
      return {
        update(view, previous) {
          runner.editor = view;
          if (!paginationKey.getState(view.state)) return;
          if (view.state.doc.eq(previous.doc)) on.request();
          else on.changed();
        },
        destroy() {
          unmount();
          runner.cancel?.();
          runner.measuring?.destroy();
          Object.assign(runner, unmounted);
        },
      };
    },
  });
}

// Moves the measuring view onto the editor's whole document and lays the pages out from it,
// counting the layouts in a row that moved the pages.
function layOutFrom(
  { editor, measuring, runner }: { editor: EditorView; measuring: EditorView; runner: Runner },
  options: LayoutContext,
  counter: LayoutCounter,
): void {
  readDomSelection(editor);
  const whole = joinDocumentPages(editor.state.doc, options.fragmentRules).doc;
  if (runner.restart) {
    runner.restart = false;
    measuring.updateState(EditorState.create({ doc: whole, plugins: measuring.state.plugins }));
  } else follow(measuring, whole);
  const tr = stepOntoPages({ editor, measuring }, options, counter);
  runner.passes = tr.docChanged ? runner.passes + 1 : 0;
}

/** Keeps an editor's pages laid out from a hidden view that measures its whole document. */
export function createPagination(options: PaginationOptions): Pagination {
  const fragmentRules = options.fragmentRules ?? FRAGMENT_RULES;
  const schedule = options.schedule ?? frame;
  const cache = createMeasureCache();
  const counter = { cache, ...createPaginationCounter(cache) };
  const readiness = createLayoutReadiness({ schedule, onChange: options.onLayoutStateChange });
  const runner: Runner = { ...unmounted, changed: true, passes: 0 };

  const context = { ...options, fragmentRules };

  const layOut = (): void => {
    runner.cancel = null;
    const { editor, measuring } = runner;
    // A layout due as the editor goes, such as when the host remounts it, has nothing to lay out.
    if (!editor || !measuring || editor.isDestroyed || measuring.isDestroyed) return;
    if (editor.composing) return request();
    if (runner.changed) runner.passes = 0;
    else if (runner.passes >= LAYOUT_PASSES) return readiness.fail();
    runner.changed = false;
    try {
      layOutFrom({ editor, measuring, runner }, context, counter);
    } catch (error) {
      readiness.fail();
      throw error;
    }
    readiness.laidOut(() => runner.cancel === null && !edits.waiting());
  };

  function request(): void {
    readiness.pending();
    runner.cancel ??= schedule(layOut);
  }

  const edits = settleEdits(options, request);
  // A change, or the host asking for a layout, starts the count of layouts in a row over.
  const change = () => {
    runner.changed = true;
    readiness.pending();
  };

  const plugin = paginationPlugin(
    runner,
    {
      // The cached measurements read the measuring view they were taken in: a new one, as when the
      // host remounts the editor, measures again.
      mount(editor) {
        cache.clear();
        runner.measuring = measuringView(
          options,
          joinDocumentPages(editor.state.doc, fragmentRules).doc,
        );
        const unwatch = edits.watch(editor);
        const unlisten = remeasureOn(options.measureIn, () => {
          cache.clear();
          request();
        });
        change();
        request();
        return () => {
          unwatch();
          unlisten();
          readiness.destroy();
        };
      },
      changed() {
        change();
        edits.request();
      },
      request,
    },
    fragmentRules,
  );

  return {
    plugin,
    refresh({ remeasure = false } = {}) {
      if (remeasure) {
        cache.clear();
        runner.restart = true;
      }
      change();
      edits.cancel();
      request();
    },
    layoutState: readiness.state,
    whenSettled: readiness.whenSettled,
    stats: counter.stats,
  };
}
