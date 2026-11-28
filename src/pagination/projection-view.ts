// A paged projection in a view of its own: the projection's pages rendered by a ProseMirror view
// mounted where the caller says, read-only to the browser's edits, which it routes to the
// canonical state (`createPagedProjection`).

import { type EditorProps, EditorView } from 'prosemirror-view';
import { keepInputAfterFocus } from '../utils/dom-selection.js';
import {
  createPagedProjection,
  type PagedProjection,
  type PagedProjectionOptions,
} from './projection.js';

/** How a projection with a view of its own is set up. */
export interface ProjectionViewOptions extends Omit<
  PagedProjectionOptions,
  'onProjection' | 'element'
> {
  /** Where the projection view mounts, the element the projection is in (`element`). */
  readonly mount: HTMLElement;
  /** The node views the pages render with. */
  readonly nodeViews?: EditorProps['nodeViews'];
}

/** A paged projection with the view that renders it. */
export interface ProjectionView extends PagedProjection {
  /** The view that shows the pages. */
  readonly view: EditorView;
}

/** Shows a canonical state on pages in a view of its own, routing input on them back to it. */
export function createProjectionView(options: ProjectionViewOptions): ProjectionView {
  let view: EditorView | null = null;
  const projection = createPagedProjection({
    ...options,
    element: options.mount,
    onProjection: (state) => view?.updateState(state),
  });
  const shown = new EditorView(options.mount, {
    state: projection.projection,
    nodeViews: options.nodeViews ?? {},
    dispatchTransaction: (tr) => projection.receive(tr),
    // A key right after focus keeps its selection on a busy page (DOCE-PAGINATION-7.22).
    handleDOMEvents: keepInputAfterFocus(undefined),
  });
  view = shown;
  const detach = projection.attach(shown);
  return {
    view: shown,
    get state() {
      return projection.state;
    },
    get projection() {
      return projection.projection;
    },
    get map() {
      return projection.map;
    },
    attach: projection.attach,
    receive: projection.receive,
    update: projection.update,
    run: projection.run,
    dispatch: projection.dispatch,
    canonicalView: projection.canonicalView,
    layout: projection.layout,
    redraw: projection.redraw,
    drawAllLines: projection.drawAllLines,
    refresh: projection.refresh,
    layoutState: projection.layoutState,
    whenSettled: projection.whenSettled,
    stats: projection.stats,
    textLines: projection.textLines,
    pagesLayout: projection.pagesLayout,
    servedFonts: projection.servedFonts,
    destroy() {
      detach();
      try {
        shown.destroy();
      } finally {
        projection.destroy();
      }
    },
  };
}
