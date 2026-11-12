// A paged projection in a view of its own: the projection's pages rendered by a ProseMirror view
// mounted where the caller says, read-only to the browser's edits, which it routes to the
// canonical state (`createPagedProjection`).

import { EditorView } from 'prosemirror-view';
import { createPagedProjection, type PagedProjection, type PagedProjectionOptions } from './projection.js';

/** How a projection with a view of its own is set up. */
export interface ProjectionViewOptions extends Omit<PagedProjectionOptions, 'onProjection'> {
  /** Where the projection view mounts. */
  readonly mount: HTMLElement;
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
    onProjection: (state) => view?.updateState(state),
  });
  const shown = new EditorView(options.mount, {
    state: projection.projection,
    nodeViews: options.nodeViews ?? {},
    dispatchTransaction: (tr) => projection.receive(tr),
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
    layout: projection.layout,
    stats: projection.stats,
    destroy() {
      detach();
      shown.destroy();
      projection.destroy();
    },
  };
}
