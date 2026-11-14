// The script editor: a script block's script in a code editor that completes the names a script
// can use and documents the one under the pointer, beside a preview that runs the script on asking
// and the reference of those names. The host's check marks the problems it finds, which keep the
// script from being applied. Applying sets the script of the block that was selected, wherever
// it is by then, or inserts one, and runs it.

import { type CodeDiagnostic, CodeEditor } from '@flamboyantengineer/ui-components/code-editor';
import { Tab, TabList, TabPanel, Tabs } from '@flamboyantengineer/ui-components/tabs';
import { NodeSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  insertScriptBlock,
  listScriptBlocks,
  runScripts,
  scriptBlockAt,
} from '../../engine/index.js';
import type { ScriptRunnerAdapter, ScriptVocabularyEntry } from '../../host/index.js';
import type { TemplateFile } from '../../model/index.js';
import { createHooks } from '../../utils/hooks.js';
import { type DialogProps, EditorModal, titleOf } from './dialog-parts.js';
import { SCRIPT_STANDARD_VOCABULARY, scriptCompletions, scriptEntryAt } from './script-language.js';
import {
  previewScript,
  ScriptPreview,
  type ScriptPreviewState,
  ScriptReference,
} from './script-panes.js';

const hooks = createHooks('script-editor', ['source', 'aside']);

// How long the script stays unchanged before the host checks it, in milliseconds.
const CHECK_DELAY = 400;

interface ScriptCheck {
  readonly diagnostics: readonly CodeDiagnostic[];
  /** Whether the host checks scripts and has not yet answered for this one. */
  readonly pending: boolean;
}

// The problems the host's check finds in the script, a moment after it stops changing. A check
// that fails finds none, so it never keeps the script from being applied.
function useScriptCheck(runner: ScriptRunnerAdapter, script: string): ScriptCheck {
  const [found, setFound] = useState<{ script: string; diagnostics: CodeDiagnostic[] }>({
    script: '',
    diagnostics: [],
  });
  useEffect(() => {
    if (!runner.check || !script.trim()) return undefined;
    const controller = new AbortController();
    const answer = (diagnostics: CodeDiagnostic[]) => {
      if (!controller.signal.aborted) setFound({ script, diagnostics });
    };
    const timer = setTimeout(() => {
      runner.check?.(script, controller.signal).then(
        (result) => answer(result.ok ? [...result.value] : []),
        () => answer([]),
      );
    }, CHECK_DELAY);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [runner, script]);
  // Problems found in an older script no longer hold.
  const answered = found.script === script;
  return {
    diagnostics: answered ? found.diagnostics : [],
    pending: Boolean(runner.check) && Boolean(script.trim()) && !answered,
  };
}

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
// new one would go), and back to not run whenever the script changes.
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
  // Each preview run is the latest only until the script changes again.
  const run = useRef(0);
  return {
    preview,
    refresh: () => {
      const current = (run.current += 1);
      setPreview({ status: 'running' });
      const at = opened ? editedBlock(view, opened)?.pos : view.state.selection.from;
      const request = { source: script, at: at ?? view.state.selection.from, template, labels };
      void previewScript(view, runner, request).then((next) => {
        if (run.current === current) setPreview(next);
      });
    },
    reset: () => {
      run.current += 1;
      setPreview({ status: 'idle' });
    },
  };
}

// The script in a code editor that completes the names a script can use, documents the one under
// the pointer and marks the problems the check found.
function ScriptSource({
  labels,
  script,
  diagnostics,
  vocabulary,
  onChange,
}: {
  labels: DialogProps['labels'];
  script: string;
  diagnostics: readonly CodeDiagnostic[];
  vocabulary: readonly ScriptVocabularyEntry[];
  onChange: (script: string) => void;
}) {
  return (
    <div {...hooks.slot('source')}>
      <CodeEditor
        label={labels.scriptSource}
        language="javascript"
        autoFocus
        tracksChanges={false}
        size="lg"
        value={script}
        diagnostics={diagnostics}
        listDiagnostics
        completions={({ value, caret }) => scriptCompletions(vocabulary, value, caret)}
        renderHover={(offset) => {
          const entry = scriptEntryAt(vocabulary, script, offset);
          return entry
            ? [entry.signature ?? entry.name, entry.description, entry.documentation]
                .filter(Boolean)
                .join(' — ')
            : null;
        }}
        onChange={onChange}
      />
    </div>
  );
}

/** Edits the script of the script block selected, or inserts one, and runs it. */
export function ScriptDialog({
  view,
  labels,
  onClose,
  runner,
  template,
}: DialogProps & { runner: ScriptRunnerAdapter; template: TemplateFile }) {
  const [found] = useState(() => scriptBlockAt(view.state));
  const [script, setScript] = useState(String(found?.node.attrs.script ?? ''));
  const { preview, refresh, reset } = useScriptPreview(view, runner, {
    script,
    opened: found,
    template,
    labels,
  });
  const { diagnostics, pending } = useScriptCheck(runner, script);
  const vocabulary = useMemo(
    () => [...(runner.vocabulary ?? []), ...SCRIPT_STANDARD_VOCABULARY],
    [runner],
  );
  const blocked = diagnostics.some((each) => (each.severity ?? 'error') === 'error');
  return (
    <EditorModal
      view={view}
      onClose={onClose}
      data-dialog="script"
      size="xl"
      title={titleOf(found ? labels.editScript : labels.script)}
      primaryAction={{
        label: labels.applyAndRun,
        isDisabled: !script.trim() || blocked || pending,
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
      <div {...hooks.root()}>
        <ScriptSource
          labels={labels}
          script={script}
          diagnostics={diagnostics}
          vocabulary={vocabulary}
          onChange={(next) => {
            setScript(next);
            reset();
          }}
        />
        <Tabs {...hooks.slot('aside')} defaultSelectedKey="preview" size="sm">
          <TabList aria-label={labels.scriptAside}>
            <Tab id="preview">{labels.scriptPreview}</Tab>
            <Tab id="reference">{labels.scriptReference}</Tab>
          </TabList>
          <TabPanel id="preview">
            <ScriptPreview
              template={template}
              labels={labels}
              preview={preview}
              onRefresh={refresh}
            />
          </TabPanel>
          <TabPanel id="reference">
            <ScriptReference vocabulary={vocabulary} labels={labels} />
          </TabPanel>
        </Tabs>
      </div>
    </EditorModal>
  );
}
