// What a printed snapshot leaves out of the editor's view: the view-only decorations
// (`src/utils/view-only-decorations.ts`) and the editor root's data attributes that describe the
// view rather than the document.

import type { DecorationSet, EditorView } from 'prosemirror-view';
import { VIEW_ONLY_ATTRIBUTE, viewOnlyHooksOf } from '../utils/view-only-decorations.js';

const VIEW_STATE_ATTRIBUTES = new Set([
  'data-mode',
  'data-suggesting',
  'data-scrollable',
  'data-layout-state',
  'data-debug',
  'data-debug-blocks',
  'data-debug-measure',
]);

// The attributes and classes the view's view-only decorations add, from every decoration source.
function viewOnlyHooks(view: EditorView) {
  const attributes = new Set<string>();
  const classes = new Set<string>();
  const collect = (set: DecorationSet) => {
    for (const decoration of set.find()) {
      const hooks = viewOnlyHooksOf(decoration);
      for (const name of hooks?.attributes ?? []) attributes.add(name);
      for (const name of hooks?.classes ?? []) classes.add(name);
    }
  };
  view.someProp('decorations', (decorations) => {
    decorations.call(view, view.state)?.forEachSet(collect);
  });
  return { attributes, classes };
}

/**
 * Takes the view's view-only decorations off a copy of its markup: their attributes and classes
 * from each element that carries the hook, and the wrapper an inline one drew once nothing else
 * is left on it.
 */
export function removeViewOnlyDecorations(copy: Element, view: EditorView): void {
  const { attributes, classes } = viewOnlyHooks(view);
  for (const element of copy.querySelectorAll(`[${VIEW_ONLY_ATTRIBUTE}]`)) {
    element.removeAttribute(VIEW_ONLY_ATTRIBUTE);
    for (const name of attributes) element.removeAttribute(name);
    for (const name of classes) element.classList.remove(name);
    if (element.classList.length === 0) element.removeAttribute('class');
    if (element.attributes.length === 0 && ['SPAN', 'MARK'].includes(element.tagName)) {
      element.replaceWith(...element.childNodes);
    }
  }
}

/** Whether a data attribute of the editor root describes the view rather than the document. */
export function isViewStateAttribute(name: string): boolean {
  return VIEW_STATE_ATTRIBUTES.has(name);
}
