// The document editor's own keys beside the document's: starting a comment, copying a link to the
// selection, and the reference and script dialogs, each while it can act. The find bar's keys are
// the editor root's (`useFindBar`), so they work outside the document too.

import type { ShortcutId } from '../../engine/index.js';
import type { ObjectDialog } from './editor-context.js';

/**
 * The editor's own keys beside the document's, by their ids in the shortcut table, while each can
 * act: starting a comment, copying a link, and the reference and script dialogs.
 */
export function editorKeys({
  startComment,
  onDialog,
  scripts,
  copyLink,
  reference,
}: {
  startComment: (() => void) | null;
  onDialog: ((dialog: ObjectDialog) => void) | null;
  scripts: boolean;
  copyLink: (() => void) | null;
  /** Whether a reference may be inserted or changed at the selection (`canInsertReference`). */
  reference: boolean;
}): (readonly [ShortcutId, () => void])[] {
  return [
    ...(startComment ? [['comment', startComment] as const] : []),
    ...(copyLink ? [['copy-link', copyLink] as const] : []),
    ...(onDialog && reference
      ? [['reference', () => onDialog({ kind: 'reference' })] as const]
      : []),
    ...(onDialog && scripts ? [['script', () => onDialog({ kind: 'script' })] as const] : []),
  ];
}
