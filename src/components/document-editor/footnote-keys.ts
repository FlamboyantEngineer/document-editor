// The keys of block inserts in a footnote's text, where no block can go (DOCE-EDITING-2.9): the
// editor takes such a key, so the browser does nothing with it either, and tells the writer why.

import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { matchesShortcut, type ShortcutId, shortcutsOf } from '../../engine/index.js';
import type { FeedbackAdapter } from '../../host/index.js';
import type { DocumentEditorLabels } from './editor-labels.js';

// The actions that add a block, which a footnote refuses.
const BLOCK_INSERTS: readonly ShortcutId[] = [
  'page-break',
  'code-block',
  'insert-table',
  'footnote',
  'script',
  'figure',
  'display-math',
];

/** Whether the selection is in a footnote's text. */
export function inFootnote(state: EditorState): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'footnote_entry') return true;
  }
  return false;
}

/**
 * Takes the key of a block insert pressed in a footnote's text, telling the writer through the
 * host's `feedback` that it cannot go there; false for any other key, or outside a footnote.
 */
export function refuseInFootnote(
  view: EditorView,
  event: KeyboardEvent,
  { labels, feedback }: { labels: DocumentEditorLabels; feedback: FeedbackAdapter | undefined },
): boolean {
  if (!inFootnote(view.state)) return false;
  const table = shortcutsOf(view.state);
  if (!BLOCK_INSERTS.some((id) => matchesShortcut(table, id, event))) return false;
  event.preventDefault();
  feedback?.notify({ tone: 'warning', text: labels.reasonFootnote });
  return true;
}
