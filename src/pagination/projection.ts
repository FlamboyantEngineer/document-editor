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
import { type Command, EditorState, Plugin, type Transaction } from 'prosemirror-state';
import { columnResizing } from 'prosemirror-tables';
import { type EditorProps, EditorView } from 'prosemirror-view';
import { FRAGMENT_RULES, type FragmentRules, type LayoutRules } from '../model/index.js';
import { holdCellSelection } from './cell-drag.js';
import type { SectionPageHeight } from './layout-document.js';
import { settleEdits } from './layout-triggers.js';
import { createMeasureCache } from './measure-blocks.js';
import { canonicalCellAt, projectionKeys } from './projection-input.js';
import { createProjectionMap, type ProjectionMap } from './projection-map.js';
import {
  layout,
  moveAcrossBreak,
  receive,
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
  readonly rules?: LayoutRules | undefined;
  readonly fragmentRules?: FragmentRules | undefined;
  readonly footnoteNumbering?: 'document' | 'page' | undefined;
  /** The node views the ghost renders with, as the projection does. */
  readonly nodeViews?: EditorProps['nodeViews'];
  /** Plugins that change what the document renders, run on the projection and the ghost. */
  readonly plugins?: readonly Plugin[] | undefined;
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
  /** Called after each layout. */
  readonly onLayout?: (() => void) | undefined;
}

/** What a projection has done since it was made. */
export interface ProjectionStats {
  /** The layouts run. */
  readonly layouts: number;
  /** PagedProjection edits refused, as a step did not map onto the canonical state. */
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
  /** Lays the pages out now. */
  layout(): void;
  stats(): ProjectionStats;
  destroy(): void;
}

// The projection's own plugin: keys and paste run on the canonical state, and a press may start a
// cell selection across the parts of a split table.
function inputPlugin(session: () => Session): Plugin {
  let keys: ReturnType<typeof projectionKeys> | null = null;
  return new Plugin({
    props: {
      handleKeyDown(view, event) {
        if (view.composing || event.isComposing) return false;
        keys ??= projectionKeys({
          keys: session().options.keys,
          run: (command) => runCommand(session(), command),
          across: (move) => moveAcrossBreak(session(), move),
        });
        const handled = keys(view, event);
        const arrow = !event.shiftKey && event.key.startsWith('Arrow');
        if (!handled && arrow) session().cells.release();
        return handled;
      },
      handlePaste: (_view, _event, slice: Slice) =>
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

/** Lays a canonical state out on pages, routing input on them back to it. */
export function createPagedProjection(options: PagedProjectionOptions): PagedProjection {
  const rules = options.fragmentRules ?? FRAGMENT_RULES;
  // The plugins' handlers run only once the session holds them.
  let current: Session | null = null;
  const session = (): Session => {
    if (!current) throw new Error('The projection is not made yet.');
    return current;
  };
  const map = createProjectionMap(options.state.doc, rules);
  const projection = EditorState.create({
    doc: options.state.doc,
    plugins: [
      inputPlugin(session),
      cellSelectionDecorations({
        selection: () => session().canonical.selection,
        map: () => session().map,
      }),
      columnResizing({ View: null }),
      ...(options.plugins ?? []),
    ],
  });
  const ghost = new EditorView(options.measureIn, {
    state: EditorState.create({ doc: options.state.doc, plugins: [...(options.plugins ?? [])] }),
    editable: () => false,
    nodeViews: options.nodeViews ?? {},
  });
  current = {
    options,
    rules,
    cache: createMeasureCache(),
    cells: holdCellSelection(),
    counts: { layouts: 0, refused: 0, relaid: 0 },
    ghost,
    edits: settleEdits(options, () => requestLayout(session())),
    canonical: options.state,
    projection,
    shown: options.state.doc,
    map,
    view: null,
    cancelLayout: null,
  };
  layout(current);
  return {
    get state() {
      return session().canonical;
    },
    get projection() {
      return session().projection;
    },
    get map() {
      return session().map;
    },
    attach(view) {
      const live = session();
      live.view = view;
      const unwatch = live.edits.watch(view);
      return () => {
        unwatch();
        if (live.view === view) live.view = null;
      };
    },
    receive: (tr) => receive(session(), tr),
    update(state, tr) {
      const live = session();
      if (state === live.canonical) return;
      live.canonical = state;
      showCanonical(live, tr ?? null);
    },
    run: (command) => runCommand(session(), command),
    layout: () => layout(session()),
    stats: () => ({ ...session().counts }),
    destroy() {
      session().cancelLayout?.();
      session().edits.cancel();
      ghost.destroy();
    },
  };
}
