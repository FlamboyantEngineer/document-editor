// The script editor's side panes: the preview, which runs the script on asking and shows what it
// produced in the template's look, without changing the document; and the reference, the names a
// script can use, by the object they belong to, found by a filter.

import { Button } from '@flamboyantengineer/ui-components/button';
import { RefreshGlyph } from '@flamboyantengineer/ui-components/core';
import { SearchField } from '@flamboyantengineer/ui-components/search-field';
import { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useMemo, useState } from 'react';
import type { ScriptRunnerAdapter, ScriptVocabularyEntry } from '../../host/index.js';
import {
  readDocumentFile,
  type StoredContent,
  type TemplateFile,
  writeDocumentFile,
} from '../../model/index.js';
import { createHooks } from '../../utils/hooks.js';
import { DocumentEditor } from './document-editor.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import { groupScriptVocabulary } from './script-language.js';

const hooks = createHooks('script-editor', ['preview', 'status', 'reference', 'entry']);

/** Where a preview is: not run since the script changed, running, failed, or showing its output. */
export type ScriptPreviewState =
  | { readonly status: 'idle' }
  | { readonly status: 'running' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly output: StoredContent };

/** Runs a script for its preview, the document left as it is. */
export async function previewScript(
  view: EditorView,
  runner: ScriptRunnerAdapter,
  source: string,
): Promise<ScriptPreviewState> {
  const result = await runner
    .run({ blockId: 'preview', source, document: writeDocumentFile(view.state.doc) })
    .catch((error: unknown) => ({
      ok: false as const,
      error: { kind: 'unavailable' as const, message: String(error) },
    }));
  if (!result.ok) return { status: 'error', message: result.error.message ?? '' };
  return { status: 'ready', output: result.value };
}

// The output shown read-only, in the template's look, in the web layout.
function PreviewDocument({
  view,
  output,
  template,
  labels,
}: {
  view: EditorView;
  output: StoredContent;
  template: TemplateFile;
  labels: DocumentEditorLabels;
}) {
  const [state, setState] = useState(() =>
    EditorState.create({
      doc: readDocumentFile(
        { formatVersion: 1, sections: [{ name: null, content: output }] },
        view.state.schema,
      ).doc,
    }),
  );
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={template}
      layout="web"
      editable={false}
      aria-label={labels.scriptPreview}
    />
  );
}

/** The preview: a button that runs the script, then what it produced, or why it failed. */
export function ScriptPreview({
  view,
  template,
  labels,
  preview,
  onRefresh,
}: {
  view: EditorView;
  template: TemplateFile;
  labels: DocumentEditorLabels;
  preview: ScriptPreviewState;
  onRefresh: () => void;
}) {
  const message =
    preview.status === 'idle'
      ? labels.scriptPreviewIdle
      : preview.status === 'running'
        ? labels.scriptPreviewRunning
        : preview.status === 'error'
          ? preview.message
          : preview.output.length
            ? null
            : labels.scriptPreviewEmpty;
  return (
    <div {...hooks.slot('preview', { status: preview.status })}>
      <Button
        size="sm"
        startIcon={RefreshGlyph}
        isPending={preview.status === 'running'}
        onPress={onRefresh}
      >
        {labels.refreshPreview}
      </Button>
      {message === null ? null : (
        <p {...hooks.slot('status')} role="status">
          {message}
        </p>
      )}
      {preview.status === 'ready' && preview.output.length ? (
        <PreviewDocument view={view} output={preview.output} template={template} labels={labels} />
      ) : null}
    </div>
  );
}

// Whether an entry matches a filter, by its name, signature or description.
const matches = (entry: ScriptVocabularyEntry, filter: string) =>
  [entry.name, entry.signature, entry.description]
    .filter(Boolean)
    .some((text) => String(text).toLowerCase().includes(filter.toLowerCase()));

/** The names a script can use, by the object they belong to, with what each does. */
export function ScriptReference({
  vocabulary,
  labels,
}: {
  vocabulary: readonly ScriptVocabularyEntry[];
  labels: DocumentEditorLabels;
}) {
  const [filter, setFilter] = useState('');
  const groups = useMemo(
    () => groupScriptVocabulary(vocabulary.filter((entry) => matches(entry, filter.trim()))),
    [vocabulary, filter],
  );
  return (
    <div {...hooks.slot('reference')}>
      <SearchField
        label={labels.filterScriptReference}
        labelLayout="control-only"
        size="sm"
        value={filter}
        onChange={setFilter}
      />
      {groups.map(([root, entries]) => (
        <section key={root} aria-label={root || labels.scriptGlobals}>
          <h3>{root || labels.scriptGlobals}</h3>
          <dl>
            {entries.map((entry) => (
              <div key={entry.name} {...hooks.slot('entry', { kind: entry.kind ?? 'property' })}>
                <dt>
                  <code>{entry.signature ?? entry.name}</code>
                </dt>
                <dd>{[entry.description, entry.documentation].filter(Boolean).join(' ')}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
