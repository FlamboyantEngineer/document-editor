// What a printed snapshot leaves out of the editor's view: the view-only decorations
// (`src/utils/view-only-decorations.ts`), the editor root's data attributes that describe the
// view rather than the document, and the suggestions its markup does not show.

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
  'data-debug-source',
  'data-formatting-marks',
]);

// The attributes and classes view-only decorations add: as the hooks in the markup name them,
// and as the view's decorations record them. The markup's hooks cover a view whose decorations
// another state draws, as on a projection; the recorded ones cover two decorations PM merged
// onto one element, which keeps only one of their hooks.
function viewOnlyHooks(view: EditorView, copy: Element) {
  const attributes = new Set<string>();
  const classes = new Set<string>();
  for (const element of copy.querySelectorAll(`[${VIEW_ONLY_ATTRIBUTE}]`)) {
    for (const token of (element.getAttribute(VIEW_ONLY_ATTRIBUTE) ?? '').split(/\s+/)) {
      if (token.startsWith('.')) classes.add(token.slice(1));
      else if (token.startsWith('data-') || token === 'style') attributes.add(token);
    }
  }
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

/** How a snapshot shows suggestions: all their markup, as if accepted, or as if rejected. */
export type SnapshotMarkup = 'all' | 'final' | 'original';

// The markup a snapshot takes from the editor's: its simple markup prints as if accepted.
const EDITOR_MARKUP: Readonly<Record<string, SnapshotMarkup>> = {
  all: 'all',
  simple: 'final',
  final: 'final',
  original: 'original',
};

/** The markup a snapshot of the view shows by default: the editor's own. */
export function editorMarkup(view: EditorView): SnapshotMarkup {
  const root = view.dom.closest('[data-markup]');
  return EDITOR_MARKUP[root?.getAttribute('data-markup') ?? ''] ?? 'all';
}

/**
 * Shows a copy of the view's markup with its suggestions as the markup says: as if accepted, the
 * suggested deletions gone and the insertions plain text; as if rejected, the other way round.
 */
export function applySuggestionMarkup(copy: Element, markup: SnapshotMarkup): void {
  if (markup === 'all') return;
  const [kept, dropped] = markup === 'final' ? ['ins', 'del'] : ['del', 'ins'];
  // A suggestion's element carries its id, or only its comment thread's id.
  const suggestion = ':is([data-id], [data-comment-id])';
  for (const element of copy.querySelectorAll(`${dropped}${suggestion}`)) element.remove();
  for (const element of copy.querySelectorAll(`${kept}${suggestion}`)) {
    element.replaceWith(...element.childNodes);
  }
}

/**
 * Takes the view's view-only decorations off a copy of its markup: a widget whole; an inline or
 * node decoration's attributes and classes from each element that carries the hook, and the
 * wrapper an inline one drew once nothing else is left on it.
 */
export function removeViewOnlyDecorations(copy: Element, view: EditorView): void {
  const { attributes, classes } = viewOnlyHooks(view, copy);
  for (const element of copy.querySelectorAll(`[${VIEW_ONLY_ATTRIBUTE}]`)) {
    if (element.classList.contains('ProseMirror-widget')) {
      element.remove();
      continue;
    }
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

/**
 * The print rules for what the editor draws only as a marker or for editing, which every printed
 * page carries (DOCE-EDITOR-6.33): a manual page break keeps its place but draws no line or label,
 * and table cells are positioned statically, so their backgrounds paint under collapsed borders.
 */
export const PRINT_MARKER_RULES = [
  '[data-print="true"] :is(hr.manual-page-break, [data-page-break])::before,',
  '[data-print="true"] :is(hr.manual-page-break, [data-page-break])::after',
  '{ content: none !important; display: none !important; }',
  '[data-print="true"] :is(td, th) { position: static !important; }',
].join(' ');
