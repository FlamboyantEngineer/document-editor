// The script dialog: a script block's script in a code editor, applied to the block selected or
// inserted as a new block, then run through the host's script runner.

import { CodeEditor } from '@flamboyantengineer/ui-components/code-editor';
import { NodeSelection } from 'prosemirror-state';
import { useState } from 'react';
import {
  insertScriptBlock,
  listScriptBlocks,
  runScripts,
  scriptBlockAt,
  setScriptSource,
} from '../../engine/index.js';
import type { ScriptRunnerAdapter } from '../../host/index.js';
import { type DialogProps, EditorModal, titleOf } from './dialog-parts.js';

/** Edits the script of the script block selected, or inserts one, and runs it. */
export function ScriptDialog({
  view,
  labels,
  onClose,
  runner,
}: DialogProps & { runner: ScriptRunnerAdapter }) {
  const [found] = useState(() => scriptBlockAt(view.state));
  const [script, setScript] = useState(String(found?.node.attrs.script ?? ''));
  const apply = (close: () => void) => {
    close();
    const before = new Set(listScriptBlocks(view.state.doc).map((block) => block.id));
    if (found) {
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, found.pos)));
      setScriptSource(script)(view.state, view.dispatch);
    } else insertScriptBlock(script)(view.state, view.dispatch);
    // The block edited runs, by its id, or the block inserted, by the id it was given.
    const edited = found?.node.attrs.dataId as string | undefined;
    const ids = edited
      ? [edited]
      : listScriptBlocks(view.state.doc)
          .map((block) => block.id)
          .filter((id) => !before.has(id));
    view.focus();
    return runScripts(view, runner, { ids });
  };
  return (
    <EditorModal
      view={view}
      onClose={onClose}
      data-dialog="script"
      size="lg"
      title={titleOf(found ? labels.editScript : labels.script)}
      primaryAction={{
        label: labels.applyAndRun,
        isDisabled: !script.trim(),
        onPress: apply,
      }}
    >
      <CodeEditor
        label={labels.scriptSource}
        language="javascript"
        autoFocus
        tracksChanges={false}
        value={script}
        onChange={setScript}
      />
    </EditorModal>
  );
}
