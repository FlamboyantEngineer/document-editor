// The document editor's own keys beside the document's: starting a comment, copying a link to the
// selection, and the reference, figure, display math and script dialogs, each while it can act.
// The find bar's keys are the editor root's (`useFindBar`), so they work outside the document too.

import type { EditorState } from 'prosemirror-state';
import { canInsertReference, insertMath, setFigure, type ShortcutId } from '../../engine/index.js';
import type { ObjectDialog } from './editor-context.js';

/**
 * The editor's own keys beside the document's, by their ids in the shortcut table, while each can
 * act at the selection of `state`: starting a comment, copying a link, and the reference, figure,
 * display math and script dialogs.
 */
export function editorKeys({
  startComment,
  onDialog,
  scripts,
  copyLink,
  state,
}: {
  startComment: (() => void) | null;
  onDialog: ((dialog: ObjectDialog) => void) | null;
  scripts: boolean;
  copyLink: (() => void) | null;
  state: EditorState;
}): (readonly [ShortcutId, () => void])[] {
  const dialogs: (readonly [ShortcutId, ObjectDialog, boolean])[] = onDialog
    ? [
        ['reference', { kind: 'reference' }, canInsertReference(state)],
        ['figure', { kind: 'figure' }, setFigure({ src: 'about:blank' })(state)],
        [
          'display-math',
          { kind: 'math', display: true },
          insertMath('x', { display: true })(state),
        ],
        ['script', { kind: 'script' }, scripts],
      ]
    : [];
  return [
    ...(startComment ? [['comment', startComment] as const] : []),
    ...(copyLink ? [['copy-link', copyLink] as const] : []),
    ...dialogs
      .filter(([, , can]) => can)
      .map(([id, dialog]) => [id, () => onDialog?.(dialog)] as const),
  ];
}
