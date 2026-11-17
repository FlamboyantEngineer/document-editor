// The script dialog: the script editor on a script block's script. The host's check marks the
// problems it finds, which keep the script from being applied. Applying sets the script of the
// block that was selected, wherever it is by then, or inserts one, and runs it.

import { NodeSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  insertScriptBlock,
  listScriptBlocks,
  runScripts,
  scriptBlockAt,
} from '../../engine/index.js';
import type { ScriptRunnerAdapter } from '../../host/index.js';
import { type TemplateFile, writeDocumentFile } from '../../model/index.js';
import { type DialogProps, EditorModal, titleOf } from './dialog-parts.js';
import { hasScriptErrors, ScriptEditor, useScriptCheck } from './script-editor.js';
import {
  drawingPlugins,
  previewScript,
  type ScriptPreviewState,
  type ScriptPreviewViews,
} from './script-panes.js';

type OpenedBlock = NonNullable<ReturnType<typeof scriptBlockAt>>;

// The block the dialog edits, where it is now. The document may have changed while the dialog was
// open, as when another writer adds a paragraph before the block, so the place it had on opening
// may hold something else: the block is found again by its element id. One without an id is known
// only while it is still the node at that place. Null once the block is gone.
function editedBlock(view: EditorView, opened: OpenedBlock) {
  const id = opened.node.attrs.dataId as unknown;
  if (typeof id === 'string' && id) {
    return listScriptBlocks(view.state.doc).find((block) => block.id === id) ?? null;
  }
  return view.state.doc.nodeAt(opened.pos) === opened.node ? { ...opened, id: null } : null;
}

// Sets the script of the block the dialog edits and selects it, or inserts a block with the script;
// gives the ids of the blocks to run. Throws with `gone` when the block edited is no longer there.
function applyScript(
  view: EditorView,
  { opened, script, gone }: { opened: OpenedBlock | null; script: string; gone: string },
): string[] {
  if (!opened) {
    const before = new Set(listScriptBlocks(view.state.doc).map((block) => block.id));
    insertScriptBlock(script)(view.state, view.dispatch);
    // The block inserted runs, by the id it was given.
    return listScriptBlocks(view.state.doc)
      .map((block) => block.id)
      .filter((id) => !before.has(id));
  }
  const block = editedBlock(view, opened);
  if (!block) throw new Error(gone);
  const tr = view.state.tr;
  if (block.node.attrs.script !== script) {
    tr.setNodeMarkup(block.pos, undefined, { ...block.node.attrs, script });
  }
  view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, block.pos)));
  return block.id === null ? [] : [block.id];
}

// The preview's state: run on asking, numbered on from where the block edited is now (or where a
// new one would go), and back to not run whenever the script changes, which stops the run asked.
function useScriptPreview(
  view: EditorView,
  runner: ScriptRunnerAdapter,
  {
    script,
    opened,
    template,
    labels,
  }: {
    script: string;
    opened: OpenedBlock | null;
    template: TemplateFile;
    labels: DialogProps['labels'];
  },
) {
  const [preview, setPreview] = useState<ScriptPreviewState>({ status: 'idle' });
  // The run in flight, the latest only until the script changes again or the dialog closes.
  const run = useRef<AbortController | null>(null);
  useEffect(() => () => run.current?.abort(), []);
  return {
    preview,
    refresh: () => {
      run.current?.abort();
      const current = new AbortController();
      run.current = current;
      setPreview({ status: 'running' });
      const at = opened ? editedBlock(view, opened)?.pos : view.state.selection.from;
      const { signal } = current;
      const request = { source: script, at: at ?? view.state.selection.from, template, labels };
      void previewScript(view, runner, { ...request, signal }).then((next) => {
        if (!current.signal.aborted) setPreview(next);
      });
    },
    reset: () => {
      run.current?.abort();
      run.current = null;
      setPreview({ status: 'idle' });
    },
  };
}

/** What the script dialog is given beside a dialog's props. */
interface ScriptDialogProps extends DialogProps {
  readonly runner: ScriptRunnerAdapter;
  readonly template: TemplateFile;
  /** The host's node views, which the preview draws as the editor does. */
  readonly nodeViews?: ScriptPreviewViews['nodeViews'];
}

/** Edits the script of the script block selected, or inserts one, and runs it. */
export function ScriptDialog({
  view,
  labels,
  onClose,
  runner,
  template,
  nodeViews,
}: ScriptDialogProps) {
  const [found] = useState(() => scriptBlockAt(view.state));
  const [script, setScript] = useState(String(found?.node.attrs.script ?? ''));
  const { preview, refresh, reset } = useScriptPreview(view, runner, {
    script,
    opened: found,
    template,
    labels,
  });
  const { diagnostics, pending } = useScriptCheck(runner, script, () => ({
    blockId: found ? (editedBlock(view, found)?.id ?? null) : null,
    document: writeDocumentFile(view.state.doc),
  }));
  const previewViews = useMemo(
    () => ({ plugins: drawingPlugins(view.state), nodeViews }),
    [view, nodeViews],
  );
  return (
    <EditorModal
      view={view}
      onClose={onClose}
      data-dialog="script"
      size="xl"
      title={titleOf(found ? labels.editScript : labels.script)}
      primaryAction={{
        label: labels.applyAndRun,
        isDisabled: !script.trim() || hasScriptErrors(diagnostics) || pending,
        // The dialog closes once the script is in the document: while its block is gone the
        // dialog stays, saying so, with the script the writer would otherwise lose.
        onPress: (close: () => void) => {
          const ids = applyScript(view, { opened: found, script, gone: labels.scriptBlockGone });
          close();
          view.focus();
          return runScripts(view, runner, { ids });
        },
      }}
    >
      <ScriptEditor
        runner={runner}
        labels={labels}
        template={template}
        script={script}
        onScriptChange={(next) => {
          setScript(next);
          reset();
        }}
        diagnostics={diagnostics}
        preview={preview}
        onRefreshPreview={refresh}
        previewViews={previewViews}
      />
    </EditorModal>
  );
}
