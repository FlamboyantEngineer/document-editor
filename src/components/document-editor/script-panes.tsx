// The script editor's side panes: the preview, which runs the script on asking and shows what it
// produced in the template's look, without changing the document; and the reference, the names a
// script can use, by the object they belong to, found by a filter.

import { Button } from '@flamboyantengineer/ui-components/button';
import { RefreshGlyph } from '@flamboyantengineer/ui-components/core';
import { SearchField } from '@flamboyantengineer/ui-components/search-field';
import type { Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useMemo, useState } from 'react';
import type { ScriptRunnerAdapter, ScriptVocabularyEntry } from '../../host/index.js';
import {
  isDocumentFormatError,
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

/**
 * Where a preview is: not run since the script changed, running, failed, or showing the document
 * its output makes, null when the script produced nothing.
 */
export type ScriptPreviewState =
  | { readonly status: 'idle' }
  | { readonly status: 'running' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly document: ProseMirrorNode | null };

// The document a script's output makes; an output the schema refuses throws.
function outputDocument(output: StoredContent, schema: Schema): ProseMirrorNode | null {
  if (output.length === 0) return null;
  return readDocumentFile({ formatVersion: 1, sections: [{ name: null, content: output }] }, schema)
    .doc;
}

/**
 * Runs a script for its preview, the document left as it is. The output is read here, where an
 * output the document cannot hold is a failure to say, rather than while the preview renders,
 * where it would take the editor down with it.
 */
export async function previewScript(
  view: EditorView,
  runner: ScriptRunnerAdapter,
  { source, labels }: { source: string; labels: DocumentEditorLabels },
): Promise<ScriptPreviewState> {
  const result = await runner
    .run({ blockId: 'preview', source, document: writeDocumentFile(view.state.doc) })
    .catch((error: unknown) => ({
      ok: false as const,
      error: { kind: 'unavailable' as const, message: String(error) },
    }));
  if (!result.ok) return { status: 'error', message: result.error.message ?? '' };
  try {
    return { status: 'ready', document: outputDocument(result.value, view.state.schema) };
  } catch (error) {
    // Why the format refused it helps whoever wrote the script; anything else is not for them.
    const reason = isDocumentFormatError(error) ? ` ${error.message}` : '';
    return { status: 'error', message: `${labels.scriptOutputRefused}${reason}` };
  }
}

// The output shown read-only, in the template's look, in the web layout.
function PreviewDocument({
  document,
  template,
  labels,
}: {
  document: ProseMirrorNode;
  template: TemplateFile;
  labels: DocumentEditorLabels;
}) {
  const [state, setState] = useState(() => EditorState.create({ doc: document }));
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

// What the preview says in place of an output, or null while it shows one.
function previewMessage(preview: ScriptPreviewState, labels: DocumentEditorLabels): string | null {
  if (preview.status === 'idle') return labels.scriptPreviewIdle;
  if (preview.status === 'running') return labels.scriptPreviewRunning;
  if (preview.status === 'error') return preview.message;
  return preview.document ? null : labels.scriptPreviewEmpty;
}

/** The preview: a button that runs the script, then what it produced, or why it failed. */
export function ScriptPreview({
  template,
  labels,
  preview,
  onRefresh,
}: {
  template: TemplateFile;
  labels: DocumentEditorLabels;
  preview: ScriptPreviewState;
  onRefresh: () => void;
}) {
  const message = previewMessage(preview, labels);
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
      {preview.status === 'ready' && preview.document ? (
        <PreviewDocument document={preview.document} template={template} labels={labels} />
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
