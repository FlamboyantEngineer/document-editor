// The context menu's entries for a script block, while the host runs scripts: edit its script, run
// it, or run every script of the document; and the scripts run each time the document opens.

import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import type { EditorView } from 'prosemirror-view';
import { useEffect, useRef } from 'react';
import { runOpeningScripts, runScripts, scriptBlockAt } from '../../engine/index.js';
import type { ScriptRunnerAdapter } from '../../host/index.js';
import type { ObjectDialog } from './editor-context.js';
import type { DocumentEditorLabels } from './editor-labels.js';

/** What the script entries need. */
export interface ScriptEntriesOptions {
  readonly labels: DocumentEditorLabels;
  readonly openDialog: ((dialog: ObjectDialog) => void) | null;
  /** Runs the scripts; without it there are no entries. */
  readonly scriptRunner?: ScriptRunnerAdapter | null | undefined;
}

/** The entries for the script block at the view's selection, or none. */
export function scriptEntries(view: EditorView, options: ScriptEntriesOptions): MenuEntry[] {
  const { labels, openDialog, scriptRunner: runner } = options;
  const found = scriptBlockAt(view.state);
  if (!found || !runner) return [];
  const id = found.node.attrs.dataId as string | undefined;
  const run = (ids?: readonly string[]) => {
    void runScripts(view, runner, ids ? { ids } : {});
  };
  return [
    ...(openDialog
      ? [
          {
            id: 'edit-script',
            label: labels.editScript,
            onAction: () => openDialog({ kind: 'script' }),
          },
        ]
      : []),
    ...(id ? [{ id: 'run-script', label: labels.runScript, onAction: () => run([id]) }] : []),
    { id: 'run-all-scripts', label: labels.runAllScripts, onAction: () => run() },
  ];
}

/** Runs the scripts that run each time the document opens, once for each view the editor makes. */
export function useOpeningScripts(
  view: EditorView | null,
  runner: ScriptRunnerAdapter | null | undefined,
): void {
  // A new runner alone does not reopen the document: the runner is read when a view comes.
  const latest = useRef(runner);
  useEffect(() => {
    latest.current = runner;
  }, [runner]);
  useEffect(() => {
    if (view && latest.current) void runOpeningScripts(view, latest.current);
  }, [view]);
}
