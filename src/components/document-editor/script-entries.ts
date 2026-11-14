// The context menu's entries for a script block, while the host runs scripts: edit its script, run
// it, or run every script of the document; and the scripts run when the document opens.

import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import type { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useEffect, useRef, useState } from 'react';
import {
  checkStaleScripts,
  runOpeningScripts,
  runScripts,
  scriptBlockAt,
} from '../../engine/index.js';
import type { ScriptRunnerAdapter } from '../../host/index.js';
import type { ObjectDialog } from './editor-context.js';
import type { DocumentEditorLabels } from './editor-labels.js';

/** What the script entries need. */
export interface ScriptEntriesOptions {
  readonly labels: DocumentEditorLabels;
  readonly openDialog: ((dialog: ObjectDialog) => void) | null;
  /** Runs the scripts; without it there are no entries. */
  readonly scriptRunner?: ScriptRunnerAdapter | null | undefined;
  /** Whether the writer's changes are recorded as suggestions. Defaults to false. */
  readonly suggesting?: boolean | undefined;
}

// A run nothing waits for must not end in a rejection nothing handles. Each block shows its own
// failure; a run that fails as a whole, as when the runner throws instead of answering, leaves
// the document as it is, which is all there is to tell.
const settle = (run: Promise<unknown>) => {
  run.catch(() => undefined);
};

/** Runs the view's scripts, or those with the ids given, from a menu: nothing waits for the run. */
export function startScripts(
  view: EditorView,
  runner: ScriptRunnerAdapter,
  ids?: readonly string[],
): void {
  settle(runScripts(view, runner, ids ? { ids } : {}));
}

/**
 * The entries for the script block at the view's selection, or none. A script's output replaces the
 * block's content outright, which no suggestion tracks, so while the writer suggests the entries
 * wait, saying why, as the Tools menu's does.
 */
export function scriptEntries(view: EditorView, options: ScriptEntriesOptions): MenuEntry[] {
  const { labels, openDialog, scriptRunner: runner } = options;
  const found = scriptBlockAt(view.state);
  if (!found || !runner) return [];
  const id = found.node.attrs.dataId as string | undefined;
  const waiting = options.suggesting
    ? { isDisabled: true, focusableWhenDisabled: true, description: labels.reasonSuggesting }
    : {};
  return [
    ...(openDialog
      ? [
          {
            id: 'edit-script',
            label: labels.editScript,
            ...waiting,
            onAction: () => openDialog({ kind: 'script' }),
          },
        ]
      : []),
    ...(id
      ? [
          {
            id: 'run-script',
            label: labels.runScript,
            ...waiting,
            onAction: () => startScripts(view, runner, [id]),
          },
        ]
      : []),
    {
      id: 'run-all-scripts',
      label: labels.runAllScripts,
      ...waiting,
      onAction: () => startScripts(view, runner),
    },
  ];
}

/** What decides whether, and for which document, the opening scripts run. */
export interface OpeningScriptsOptions {
  /** The plugins of the state the host gave. */
  readonly plugins: readonly Plugin[];
  readonly runner: ScriptRunnerAdapter | null | undefined;
  /** Whether the writer edits the document directly: not a reader, and not suggesting. */
  readonly enabled: boolean;
}

/**
 * Runs the scripts that run each time the document opens, once for each document the editor is
 * given, however many views it makes of it, as when the layout switches. They run for a writer who
 * edits directly: their output changes the document, which a reader does not, and which no
 * suggestion tracks. When the runner keys the inputs a script reads, the other scripts' outputs are
 * then checked, and the ones whose inputs changed marked stale.
 */
export function useOpeningScripts(view: EditorView | null, options: OpeningScriptsOptions): void {
  const { runner, enabled } = options;
  // A document the host opens comes with plugins of its own, which its states keep, while the
  // engine adds one more to the states it shows: the document is known by the first of them.
  const [document] = options.plugins;
  // A new runner alone does not reopen the document: the runner is read when the scripts run.
  const latest = useRef(runner);
  useEffect(() => {
    latest.current = runner;
  }, [runner]);
  const opened = useRef<{ readonly document: Plugin | undefined } | null>(null);
  const [retries, setRetries] = useState(0);
  useEffect(() => {
    const run = latest.current;
    if (!view || !run || !enabled || opened.current?.document === document) return;
    const opening = { document };
    opened.current = opening;
    // The opening scripts record the inputs they read before the rest are checked for stale output.
    void runOpeningScripts(view, run)
      .then(() => (run.inputsKey && !view.isDestroyed ? checkStaleScripts(view, run) : []))
      .catch(() => undefined)
      .then(() => {
        // A view replaced while its scripts ran, as when the pages start, took none of their
        // output: they run again on the view that replaced it.
        if (!view.isDestroyed || opened.current !== opening) return;
        opened.current = null;
        setRetries((count) => count + 1);
      });
  }, [view, document, enabled, retries]);
}
