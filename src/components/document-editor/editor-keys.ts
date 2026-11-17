// The document editor's own keys beside the document's: starting a comment, copying a link to the
// selection, and the reference, figure, display math and script dialogs, each while it can act.
// The find bar's keys are the editor root's (`useFindBar`), so they work outside the document too.

import type { Command, EditorState } from 'prosemirror-state';
import { useCallback, useState } from 'react';
import {
  canInsertReference,
  insertMath,
  insertScriptBlock,
  scriptBlockAt,
  setFigure,
  type ShortcutId,
} from '../../engine/index.js';
import type { ToolbarMenus } from './document-toolbar.js';
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
  run,
}: {
  startComment: (() => void) | null;
  onDialog: ((dialog: ObjectDialog) => void) | null;
  scripts: boolean;
  copyLink: (() => void) | null;
  state: EditorState;
  /** Runs a command on the view, as the script key's insertion. */
  run: (command: Command) => void;
}): (readonly [ShortcutId, () => void])[] {
  // Outside a script block the script key puts an empty one in at once, then edits it there.
  const editing = scriptBlockAt(state) !== null;
  const insertScript = editing ? null : insertScriptBlock('');
  const dialogs: (readonly [ShortcutId, ObjectDialog, boolean, Command | null])[] = onDialog
    ? [
        ['reference', { kind: 'reference' }, canInsertReference(state), null],
        ['figure', { kind: 'figure' }, setFigure({ src: 'about:blank' })(state), null],
        [
          'display-math',
          { kind: 'math', display: true },
          insertMath('x', { display: true })(state),
          null,
        ],
        [
          'script',
          { kind: 'script' },
          scripts && (editing || Boolean(insertScript?.(state))),
          insertScript,
        ],
      ]
    : [];
  return [
    ...(startComment ? [['comment', startComment] as const] : []),
    ...(copyLink ? [['copy-link', copyLink] as const] : []),
    ...dialogs
      .filter(([, , can]) => can)
      .map(
        ([id, dialog, , before]) =>
          [
            id,
            () => {
              if (before) run(before);
              onDialog?.(dialog);
            },
          ] as const,
      ),
  ];
}

/**
 * The dialogs the editor's keys open, but the toolbar's reference menu instead of the reference
 * dialog while the toolbar shows it enabled, so the writer picks the kind of reference there
 * (DOCE-EDITOR-6.2); and where the toolbar's menus say how to open them.
 */
export function useKeyDialog(openDialog: (dialog: ObjectDialog) => void) {
  const [toolbarMenus] = useState<ToolbarMenus>(() => new Map());
  const keyDialog = useCallback(
    (dialog: ObjectDialog) => {
      const menu = dialog.kind === 'reference' ? toolbarMenus.get('reference') : undefined;
      if (menu) menu();
      else openDialog(dialog);
    },
    [toolbarMenus, openDialog],
  );
  return { toolbarMenus, keyDialog };
}
