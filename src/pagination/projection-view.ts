// The paged projection (PG-40): the canonical state holds the whole document, each section on one
// page with whole blocks, and takes every edit and the undo history. A read-only view shows it on
// pages, and a hidden ghost view renders the canonical document to measure it. The projection's
// document changes only by a layout or by a canonical change mirrored onto it: any other change is
// routed to the canonical state as input, or refused and drawn again. Canonical changes reach the
// projection at once, step by step; the pages are laid out again once the writer pauses.

import type { Slice } from 'prosemirror-model';
import { type Command, EditorState, type Plugin, type Transaction } from 'prosemirror-state';
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
  PROJECTION_META,
  requestLayout,
  routeInput,
  runCommand,
  send,
  type Session,
  type SessionCore,
  showCanonical,
  syncSelection,
  take,
} from './projection-session.js';
import { cellSelectionDecorations } from './selection-mirror.js';

/** How a paged projection is set up. */
export interface ProjectionViewOptions {
  /** Where the projection view mounts. */
  readonly mount: HTMLElement;
  /** Where the ghost view that measures mounts, laid out as a page's content. */
  readonly measureIn: HTMLElement;
  /** The canonical state: the whole document, each section on one page with whole blocks. */
  readonly state: EditorState;
  readonly pageHeight: SectionPageHeight;
  readonly rules?: LayoutRules | undefined;
  readonly fragmentRules?: FragmentRules | undefined;
  readonly footnoteNumbering?: 'document' | 'page' | undefined;
  readonly nodeViews?: EditorProps['nodeViews'];
  /** Plugins that change what the document renders, run on the projection and the ghost. */
  readonly plugins?: readonly Plugin[] | undefined;
  /** Commands on the canonical state by key, beside Enter, Backspace and Delete. */
  readonly keys?: Readonly<Record<string, Command>> | undefined;
  /**
   * Receives each canonical transaction the projection's input makes; by default it is applied.
   * The new canonical state comes back through `update`.
   */
  readonly dispatch?: ((tr: Transaction) => void) | undefined;
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
  /** Projection edits refused, as a step did not map onto the canonical state. */
  readonly refused: number;
  /** Canonical changes that could not be mirrored, after which the pages were laid out at once. */
  readonly relaid: number;
}

/** A paged projection of a canonical state. */
export interface ProjectionView {
  /** The read-only projection view that shows the pages. */
  readonly view: EditorView;
  /** The canonical state as the projection shows it. */
  readonly state: EditorState;
  /** The positions between the projection and the canonical document. */
  readonly map: ProjectionMap;
  /** Shows a new canonical state; `tr`, when it made the state, is mirrored step by step. */
  update(state: EditorState, tr?: Transaction): void;
  /** Runs a command on the canonical state, with the projection's selection mirrored there first. */
  run(command: Command): boolean;
  /** Lays the pages out now. */
  layout(): void;
  stats(): ProjectionStats;
  destroy(): void;
}

// The projection view: read-only to the browser's edits, which it routes to the canonical state.
function createView(core: SessionCore, session: () => Session): EditorView {
  const { options, cells } = core;
  const keys = projectionKeys({
    keys: options.keys,
    run: (command) => runCommand(session(), command),
    across: (move) => moveAcrossBreak(session(), move),
  });
  return new EditorView(options.mount, {
    state: EditorState.create({
      doc: core.canonical.doc,
      plugins: [
        cellSelectionDecorations({
          selection: () => core.canonical.selection,
          map: () => core.map,
        }),
        columnResizing({ View: null }),
        ...(options.plugins ?? []),
      ],
    }),
    nodeViews: options.nodeViews ?? {},
    handleKeyDown(view, event) {
      if (view.composing || event.isComposing) return false;
      const handled = keys(view, event);
      if (!handled && !event.shiftKey && event.key.startsWith('Arrow')) cells.release();
      return handled;
    },
    handlePaste: (_view, _event, slice: Slice) =>
      runCommand(session(), (state, dispatch) => {
        dispatch?.(state.tr.replaceSelection(slice).scrollIntoView());
        return true;
      }),
    handleDOMEvents: {
      mousedown(view, event) {
        cells.release();
        cells.drag(view, event, {
          cellAt: (moved) => canonicalCellAt(view, core, moved),
          canonical: () => core.canonical,
          select(tr) {
            send(session(), tr);
            take(session(), view.state.tr);
          },
        });
        return false;
      },
    },
    dispatchTransaction(tr) {
      const current = session();
      const own = Boolean(tr.getMeta(PROJECTION_META));
      if (!own && tr.docChanged) return routeInput(current, tr);
      const before = current.view.state.selection;
      current.view.updateState(current.view.state.apply(tr));
      if (!own && !current.view.state.selection.eq(before)) syncSelection(current);
    },
  });
}

/** Shows a canonical state on pages, routing input on them back to it. */
export function createProjectionView(options: ProjectionViewOptions): ProjectionView {
  const rules = options.fragmentRules ?? FRAGMENT_RULES;
  const core: SessionCore = {
    options,
    rules,
    cache: createMeasureCache(),
    cells: holdCellSelection(),
    counts: { layouts: 0, refused: 0, relaid: 0 },
    canonical: options.state,
    shown: options.state.doc,
    map: createProjectionMap(options.state.doc, rules),
    cancelLayout: null,
  };
  // The view's handlers run only after it is made, once the session holds it.
  let current: Session | null = null;
  const session = (): Session => {
    if (!current) throw new Error('The projection view is not made yet.');
    return current;
  };
  const ghost = new EditorView(options.measureIn, {
    state: EditorState.create({ doc: core.canonical.doc, plugins: [...(options.plugins ?? [])] }),
    editable: () => false,
    nodeViews: options.nodeViews ?? {},
  });
  const view = createView(core, session);
  const edits = settleEdits(options, () => requestLayout(session()));
  current = Object.assign(core, { view, ghost, edits });
  const unwatch = edits.watch(view);
  layout(current);
  return {
    view,
    get state() {
      return session().canonical;
    },
    get map() {
      return session().map;
    },
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
      unwatch();
      view.destroy();
      ghost.destroy();
    },
  };
}
