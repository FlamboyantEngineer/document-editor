// The script editor: a script in a code editor that completes the names a script can use and
// documents the one under the pointer, with a switch that wraps its long lines, beside a preview
// that runs the script on asking and the reference of those names. The host's check marks the
// problems it finds, which keep the script from being previewed. The script dialog is one; a host
// reuses it for scripts of its own.

import { type CodeDiagnostic, CodeEditor } from '@flamboyantengineer/ui-components/code-editor';
import { Switch } from '@flamboyantengineer/ui-components/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@flamboyantengineer/ui-components/tabs';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ScriptCheckContext,
  ScriptRunnerAdapter,
  ScriptVocabularyEntry,
} from '../../host/index.js';
import type { TemplateFile } from '../../model/index.js';
import { createHooks } from '../../utils/hooks.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { SCRIPT_STANDARD_VOCABULARY, scriptCompletions, scriptEntryAt } from './script-language.js';
import {
  ScriptPreview,
  type ScriptPreviewState,
  type ScriptPreviewViews,
  ScriptReference,
} from './script-panes.js';

const hooks = createHooks('script-editor', ['source', 'aside']);

// How long the script stays unchanged before the host checks it, in milliseconds.
const CHECK_DELAY = 400;

/** The problems the host's check found in a script, and whether its answer is still to come. */
export interface ScriptCheck {
  readonly diagnostics: readonly CodeDiagnostic[];
  /** Whether the host checks scripts and has not yet answered for this one. */
  readonly pending: boolean;
}

/**
 * The problems the host's check finds in the script, a moment after it stops changing, told where
 * the script is by `context`, asked as each check starts. A check that fails finds none, so it
 * never keeps the script from being applied.
 */
export function useScriptCheck(
  runner: ScriptRunnerAdapter,
  script: string,
  context?: () => ScriptCheckContext,
): ScriptCheck {
  const [found, setFound] = useState<{ script: string; diagnostics: CodeDiagnostic[] }>({
    script: '',
    diagnostics: [],
  });
  const contextRef = useRef(context);
  useEffect(() => {
    contextRef.current = context;
  });
  useEffect(() => {
    if (!runner.check || !script.trim()) return undefined;
    const controller = new AbortController();
    const answer = (diagnostics: CodeDiagnostic[]) => {
      if (!controller.signal.aborted) setFound({ script, diagnostics });
    };
    const timer = setTimeout(() => {
      runner.check?.(script, controller.signal, contextRef.current?.()).then(
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

/** Whether a check found an error, which keeps a script from being previewed or applied. */
export function hasScriptErrors(diagnostics: readonly CodeDiagnostic[]): boolean {
  return diagnostics.some((each) => (each.severity ?? 'error') === 'error');
}

/**
 * The names the script editor offers: the host's, then the standard names and keywords unless the
 * host's are every name a script can use (`standardVocabulary: false`).
 */
function scriptVocabulary(runner: ScriptRunnerAdapter): readonly ScriptVocabularyEntry[] {
  const own = runner.vocabulary ?? [];
  return runner.standardVocabulary === false ? own : [...own, ...SCRIPT_STANDARD_VOCABULARY];
}

// The script in a code editor that completes the names a script can use, documents the one under
// the pointer and marks the problems the check found, its long lines wrapped until switched off.
function ScriptSource({
  labels,
  script,
  diagnostics,
  vocabulary,
  onChange,
}: {
  labels: DocumentEditorLabels;
  script: string;
  diagnostics: readonly CodeDiagnostic[];
  vocabulary: readonly ScriptVocabularyEntry[];
  onChange: (script: string) => void;
}) {
  const [wrap, setWrap] = useState(true);
  return (
    <div {...hooks.slot('source')}>
      <CodeEditor
        label={labels.scriptSource}
        language="javascript"
        autoFocus
        tracksChanges={false}
        size="lg"
        wrap={wrap ? 'soft' : 'off'}
        toolbar={
          <Switch size="sm" isSelected={wrap} onChange={setWrap}>
            {labels.scriptWrap}
          </Switch>
        }
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

/** What the script editor shows and is told of. */
export interface ScriptEditorProps {
  readonly runner: ScriptRunnerAdapter;
  readonly labels: DocumentEditorLabels;
  /** The template the preview is drawn and numbered in. */
  readonly template: TemplateFile;
  readonly script: string;
  readonly onScriptChange: (script: string) => void;
  /** The problems found in the script, as `useScriptCheck` gives them. */
  readonly diagnostics: readonly CodeDiagnostic[];
  /** Where the preview is, which the owner runs on `onRefreshPreview`. */
  readonly preview: ScriptPreviewState;
  readonly onRefreshPreview: () => void;
  /** What draws the preview as the editor draws the document. */
  readonly previewViews?: ScriptPreviewViews | undefined;
}

/**
 * A script beside its Preview and Reference tabs. Both tabs stay mounted, so switching keeps the
 * preview and where it was scrolled to; an error the check found keeps the preview from running.
 */
export function ScriptEditor({
  runner,
  labels,
  template,
  script,
  onScriptChange,
  diagnostics,
  preview,
  onRefreshPreview,
  previewViews,
}: ScriptEditorProps) {
  const vocabulary = useMemo(() => scriptVocabulary(runner), [runner]);
  return (
    <div {...hooks.root()}>
      <ScriptSource
        labels={labels}
        script={script}
        diagnostics={diagnostics}
        vocabulary={vocabulary}
        onChange={onScriptChange}
      />
      <Tabs {...hooks.slot('aside')} defaultSelectedKey="preview" size="sm">
        <TabsList aria-label={labels.scriptAside}>
          <TabsTrigger id="preview">{labels.scriptPreview}</TabsTrigger>
          <TabsTrigger id="reference">{labels.scriptReference}</TabsTrigger>
        </TabsList>
        <TabsContent id="preview" shouldForceMount>
          <ScriptPreview
            template={template}
            labels={labels}
            preview={preview}
            onRefresh={onRefreshPreview}
            blocked={hasScriptErrors(diagnostics)}
            views={previewViews}
          />
        </TabsContent>
        <TabsContent id="reference" shouldForceMount>
          <ScriptReference vocabulary={vocabulary} labels={labels} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
