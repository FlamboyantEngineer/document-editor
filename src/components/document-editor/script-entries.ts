// The context menu's entries for a script block, while the host runs scripts: edit its script, run
// it, or run every script of the document, waiting while a run is in flight; and the check of the
// opened document's outputs for stale ones. No script runs as a document opens.

import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import type { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useEffect, useMemo, useRef, useState } from 'react';
import { checkStaleScripts, runScripts, scriptBlockAt, scriptsState } from '../../engine/index.js';
import type { ScriptRunnerAdapter } from '../../host/index.js';
import type { TemplatePin } from '../../model/index.js';
import type { ObjectDialog } from './editor-context.js';
import type { DocumentEditorLabels } from './editor-labels.js';

/** What the script entries need. */
interface ScriptEntriesOptions {
  readonly labels: DocumentEditorLabels;
  readonly openDialog: ((dialog: ObjectDialog) => void) | null;
  /** Runs the scripts; without it there are no entries. */
  readonly scriptRunner?: ScriptRunnerAdapter | null | undefined;
  /** Whether the writer's changes are recorded as suggestions. Defaults to false. */
  readonly suggesting?: boolean | undefined;
}

// A runner that hands each script the document with the template it pins: the engine writes the
// document as its state holds it, which does not know the pin.
function pinnedRunner(runner: ScriptRunnerAdapter, template: TemplatePin): ScriptRunnerAdapter {
  const { inputsKey } = runner;
  return {
    ...runner,
    run: (request, signal) =>
      runner.run({ ...request, document: { ...request.document, template } }, signal),
    ...(inputsKey && {
      inputsKey: (request, signal) =>
        inputsKey.call(runner, { ...request, document: { ...request.document, template } }, signal),
    }),
  };
}

/**
 * The editor's props with the host's script runner handing each script the document with the
 * template it pins (`templatePin`, DOCE-EDITOR-4.8); as they are without a runner or a pin.
 */
export function usePinnedScripts<
  Props extends {
    readonly scriptRunner?: ScriptRunnerAdapter | undefined;
    readonly templatePin?: TemplatePin | null | undefined;
  },
>(props: Props): Props {
  const { scriptRunner, templatePin } = props;
  const runner = useMemo(
    () => (scriptRunner && templatePin ? pinnedRunner(scriptRunner, templatePin) : scriptRunner),
    [scriptRunner, templatePin],
  );
  return runner === scriptRunner ? props : { ...props, scriptRunner: runner };
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
 * Why the view's scripts cannot run now, or null when they can: the writer suggests, as a script's
 * output replaces its block's content outright, which no suggestion tracks, or a run is in flight,
 * since one runs at a time.
 */
export function scriptsWaitReason(
  view: EditorView,
  { labels, suggesting }: { labels: DocumentEditorLabels; suggesting?: boolean | undefined },
): string | null {
  if (suggesting) return labels.reasonSuggesting;
  return scriptsState(view.state).running.size > 0 ? labels.reasonScriptsRunning : null;
}

/**
 * The entries for the script block at the view's selection, or none. While the scripts cannot run
 * (`scriptsWaitReason`) the run entries wait, saying why, as the Tools menu's does; editing the
 * script waits only while the writer suggests.
 */
export function scriptEntries(view: EditorView, options: ScriptEntriesOptions): MenuEntry[] {
  const { labels, openDialog, scriptRunner: runner } = options;
  const found = scriptBlockAt(view.state);
  if (!found || !runner) return [];
  const id = found.node.attrs.dataId as string | undefined;
  const disabled = (reason: string | null) =>
    reason ? { isDisabled: true, focusableWhenDisabled: true, description: reason } : {};
  const editing = disabled(options.suggesting ? labels.reasonSuggesting : null);
  const waiting = disabled(scriptsWaitReason(view, options));
  return [
    ...(openDialog
      ? [
          {
            id: 'edit-script',
            label: labels.editScript,
            ...editing,
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

/** What decides whether, and for which document, the outputs are checked for stale ones. */
interface StaleScriptsOptions {
  /** The plugins of the state the host gave. */
  readonly plugins: readonly Plugin[];
  readonly runner: ScriptRunnerAdapter | null | undefined;
  /** Whether the writer edits the document directly: not a reader, and not suggesting. */
  readonly enabled: boolean;
}

/**
 * Checks the outputs of each document the editor is given for stale ones, once however many views
 * it makes of it, as when the layout switches, when the runner keys the inputs a script reads: the
 * ones whose inputs changed are marked stale. Nothing runs: a document opens with the output its
 * scripts produced last.
 */
export function useStaleScripts(view: EditorView | null, options: StaleScriptsOptions): void {
  const { runner, enabled } = options;
  // A document the host opens comes with plugins of its own, which its states keep, while the
  // engine adds one more to the states it shows: the document is known by the first of them.
  const [document] = options.plugins;
  // A new runner alone does not reopen the document: the runner is read when the check runs.
  const latest = useRef(runner);
  useEffect(() => {
    latest.current = runner;
  }, [runner]);
  const opened = useRef<{ readonly document: Plugin | undefined } | null>(null);
  const [retries, setRetries] = useState(0);
  useEffect(() => {
    const run = latest.current;
    if (!view || !run?.inputsKey || !enabled || opened.current?.document === document) return;
    const opening = { document };
    opened.current = opening;
    void checkStaleScripts(view, run)
      .catch(() => undefined)
      .then(() => {
        // A view replaced while the check ran, as when the pages start, took none of its marks:
        // the check runs again on the view that replaced it.
        if (!view.isDestroyed || opened.current !== opening) return;
        opened.current = null;
        setRetries((count) => count + 1);
      });
  }, [view, document, enabled, retries]);
}
