// The script editor: a script block's script in a code editor that completes the names a script
// can use and documents the one under the pointer, beside a preview that runs the script on asking
// and the reference of those names. The host's check marks the problems it finds, which keep the
// script from being applied. Applying sets the script of the block selected, or inserts one, and
// runs it.

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
  setScriptSource,
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

// The problems the host's check finds in the script, a moment after it stops changing.
function useScriptCheck(runner: ScriptRunnerAdapter, script: string): readonly CodeDiagnostic[] {
  const [found, setFound] = useState<{ script: string; diagnostics: CodeDiagnostic[] }>({
    script: '',
    diagnostics: [],
  });
  useEffect(() => {
    if (!runner.check || !script.trim()) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void runner.check?.(script, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        setFound({ script, diagnostics: result.ok ? [...result.value] : [] });
      });
    }, CHECK_DELAY);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [runner, script]);
  // Problems found in an older script no longer hold.
  return found.script === script ? found.diagnostics : [];
}

// Sets the script of the block found, or inserts a block with it, and runs that block.
function applyScript(
  view: EditorView,
  runner: ScriptRunnerAdapter,
  { found, script }: { found: ReturnType<typeof scriptBlockAt>; script: string },
) {
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
}

// The preview's state: run on asking, and back to not run whenever the script changes.
function useScriptPreview(view: EditorView, runner: ScriptRunnerAdapter, script: string) {
  const [preview, setPreview] = useState<ScriptPreviewState>({ status: 'idle' });
  // Each preview run is the latest only until the script changes again.
  const run = useRef(0);
  return {
    preview,
    refresh: () => {
      const current = (run.current += 1);
      setPreview({ status: 'running' });
      void previewScript(view, runner, script).then((next) => {
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
  const { preview, refresh, reset } = useScriptPreview(view, runner, script);
  const diagnostics = useScriptCheck(runner, script);
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
        isDisabled: !script.trim() || blocked,
        onPress: (close: () => void) => {
          close();
          return applyScript(view, runner, { found, script });
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
              view={view}
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
