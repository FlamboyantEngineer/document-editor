// Shows a lab's canonical state on pages, as the document editor does: a read-only projection
// renders the pages in `.lab-pages`, a ghost in `.de-document-editor__measure` measures, and every
// edit on the pages goes to the canonical state. The root reports the page count
// (`data-lab-pages`) and that the pages are laid out (`data-lab-ready`) after each layout.

import type { Node } from 'prosemirror-model';
import {
  createProjectionView,
  type ProjectionView,
  type ProjectionViewOptions,
} from '../../src/pagination/index.js';

/** How a lab's pages are set up: a projection view's options, without where it mounts. */
export interface LabPagesOptions extends Omit<ProjectionViewOptions, 'mount' | 'measureIn'> {
  /** Called after each layout, once the root reports it. */
  readonly onLaidOut?: ((pages: ProjectionView) => void) | undefined;
}

const pageCount = (doc: Node) => {
  let count = 0;
  doc.descendants((node) => {
    if (node.type.name === 'page') count += 1;
    return node.type.name === 'doc' || node.type.name === 'page_section';
  });
  return count;
};

/** The lab's mount points: the pages and the measuring element; null when the page lacks one. */
export function labMounts(): {
  readonly mount: HTMLElement;
  readonly measureIn: HTMLElement;
} | null {
  const measureIn = document.querySelector<HTMLElement>('.de-document-editor__measure');
  const mount = document.querySelector<HTMLElement>('.lab-pages');
  return measureIn && mount ? { mount, measureIn } : null;
}

/** Shows a canonical state on pages in the lab's mount points. */
export function showOnPages(
  mounts: { readonly mount: HTMLElement; readonly measureIn: HTMLElement },
  { onLaidOut, onLayout, ...options }: LabPagesOptions,
): ProjectionView {
  let pages: ProjectionView | null = null;
  pages = createProjectionView({
    ...mounts,
    // The ghost measures the blocks as the canonical plugins draw them, as DocumentEditor's does.
    ghostPlugins: options.state.plugins,
    ...options,
    onLayout(tr) {
      onLayout?.(tr);
      const { dataset } = document.documentElement;
      dataset.labPages = String(pageCount(tr.doc));
      dataset.labReady = 'true';
      // The first layout runs while the projection is made.
      if (pages) onLaidOut?.(pages);
      else queueMicrotask(() => pages && onLaidOut?.(pages));
    },
  });
  return pages;
}
