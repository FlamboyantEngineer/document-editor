// The context menu's entries for the caption of the table, figure or code block at the selection:
// editing it, in place for a table's or a figure's, in a dialog for a code block's attribute, and
// showing or hiding it.

import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import type { EditorView } from 'prosemirror-view';
import { captionedAt, editCaption, toggleCaption } from '../../engine/index.js';
import { titleOf } from './dialog-parts.js';
import type { ObjectDialog } from './editor-context.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { commandEntry } from './table-actions.js';

interface CaptionEntriesOptions {
  readonly labels: DocumentEditorLabels;
  /** Opens one of the editor's dialogs; null while the editor has none. */
  readonly openDialog: ((dialog: ObjectDialog) => void) | null;
}

/** The caption entries for the captioned object at the selection; none without one. */
export function captionEntries(view: EditorView, options: CaptionEntriesOptions): MenuEntry[] {
  const captioned = captionedAt(view.state);
  if (!captioned) return [];
  const { labels, openDialog } = options;
  const hidden = captioned.node.attrs.captionEnabled === false;
  const toggle = commandEntry(
    view,
    { id: 'toggle-caption', label: labels.showCaption(hidden) },
    toggleCaption(),
  );
  if (captioned.node.type.name !== 'code_block') {
    const label = titleOf(labels.editCaption);
    return [commandEntry(view, { id: 'edit-caption', label }, editCaption), toggle];
  }
  if (!openDialog) return [toggle];
  const edit = { id: 'edit-caption', label: labels.editCaption };
  return [{ ...edit, onAction: () => openDialog({ kind: 'caption' }) }, toggle];
}
