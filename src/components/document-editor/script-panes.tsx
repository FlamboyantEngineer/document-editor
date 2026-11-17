// The script editor's side panes: the preview, which runs the script on asking and shows what it
// produced in the template's look, numbered on from where its block is, without changing the
// document; and the reference, the names a
// script can use, by the object they belong to, found by a filter.

import { Button } from '@flamboyantengineer/ui-components/button';
import { RefreshGlyph } from '@flamboyantengineer/ui-components/core';
import type { RichTextNodeViewProps } from '@flamboyantengineer/ui-components/rich-text-editor';
import { SearchField } from '@flamboyantengineer/ui-components/search-field';
import type { Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import { EditorState, type Plugin, type PluginKey } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { type ComponentType, type CSSProperties, useMemo, useState } from 'react';
import { contentsKey, dynamicTemplatesKey } from '../../engine/index.js';
import type { ScriptRunnerAdapter, ScriptVocabularyEntry } from '../../host/index.js';
import {
  isDocumentFormatError,
  type NumberingCounters,
  numberingCountersAt,
  readDocumentFile,
  sectionAt,
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
 * its output makes, null when the script produced nothing, with the counters its block is under.
 */
export type ScriptPreviewState =
  | { readonly status: 'idle' }
  | { readonly status: 'running' }
  | { readonly status: 'error'; readonly message: string }
  | {
      readonly status: 'ready';
      readonly document: ProseMirrorNode | null;
      readonly counters: NumberingCounters;
    };

// The stylesheet's counters, for each numbered object kind.
const OBJECT_COUNTERS = {
  figure: 'figure',
  table: 'table',
  codeBlock: 'codeblock',
  equation: 'equation',
} as const;

/**
 * The counters as a `counter-reset` value, `--de-script-editor-counters`, so the preview's headings
 * and objects number on from the ones before its block.
 */
export function previewCounters({ headings, objects }: NumberingCounters): string {
  const levels = headings.map((count, index) => `h${String(index + 1)} ${String(count)}`);
  const kinds = Object.entries(OBJECT_COUNTERS).map(
    ([kind, counter]) => `${counter} ${String(objects[kind as keyof typeof OBJECT_COUNTERS])}`,
  );
  return [...levels, ...kinds, 'ordered-list 0'].join(' ');
}

// The document a script's output makes, in the section its block is in, so the section's own
// template settings, such as its width and styles, apply; an output the schema refuses throws.
function outputDocument(
  output: StoredContent,
  schema: Schema,
  section: string | null,
): ProseMirrorNode | null {
  if (output.length === 0) return null;
  const sections = [{ name: section, content: output }];
  return readDocumentFile({ formatVersion: 1, sections }, schema).doc;
}

/**
 * What draws the preview as the editor draws the document: the plugins of the editor's state that
 * draw node views, such as typeset math, signatures and linked code, and the host's node views.
 */
export interface ScriptPreviewViews {
  readonly plugins: readonly Plugin[];
  readonly nodeViews?: Readonly<Record<string, ComponentType<RichTextNodeViewProps>>> | undefined;
}

// The plugins that draw node views which every editor's layout adds itself, the preview's too.
const LAYOUT_DRAWN = new Set<PluginKey>([dynamicTemplatesKey, contentsKey]);

/**
 * The plugins of an editor's state that draw node views, for a preview drawn as it draws, but for
 * those its layout adds of its own.
 */
export function drawingPlugins(state: EditorState): Plugin[] {
  return state.plugins.filter(
    (plugin) => plugin.props.nodeViews && !LAYOUT_DRAWN.has(plugin.spec.key as PluginKey),
  );
}

/** What a preview runs: the script, where its block is, and the template that numbers it. */
interface ScriptPreviewRequest {
  readonly source: string;
  /** The position of the script's block, or where a new one would go. */
  readonly at: number;
  readonly template: TemplateFile;
  readonly labels: DocumentEditorLabels;
  /** Stops the run, as when the script changes before it answers. */
  readonly signal?: AbortSignal | undefined;
}

/**
 * Runs a script for its preview, the document left as it is. The output is read here, where an
 * output the document cannot hold is a failure to say, rather than while the preview renders,
 * where it would take the editor down with it.
 */
export async function previewScript(
  view: EditorView,
  runner: ScriptRunnerAdapter,
  { source, at, template, labels, signal }: ScriptPreviewRequest,
): Promise<ScriptPreviewState> {
  const { doc } = view.state;
  const request = { purpose: 'preview', blockId: 'preview', source } as const;
  const result = await runner
    .run({ ...request, document: writeDocumentFile(doc) }, signal)
    .catch((error: unknown) => ({
      ok: false as const,
      error: { kind: 'unavailable' as const, message: String(error) },
    }));
  if (!result.ok) return { status: 'error', message: result.error.message ?? '' };
  try {
    const place = Math.min(at, doc.content.size);
    const section = sectionAt(doc.resolve(place))?.name ?? null;
    return {
      status: 'ready',
      document: outputDocument(result.value.content, doc.type.schema, section),
      counters: numberingCountersAt(doc, template, place),
    };
  } catch (error) {
    // Why the format refused it helps whoever wrote the script; anything else is not for them.
    const reason = isDocumentFormatError(error) ? ` ${error.message}` : '';
    return { status: 'error', message: `${labels.scriptOutputRefused}${reason}` };
  }
}

// The output shown read-only, in the template's look, in the web layout, drawn as the editor
// draws the document.
function PreviewDocument({
  document,
  template,
  labels,
  views,
}: {
  document: ProseMirrorNode;
  template: TemplateFile;
  labels: DocumentEditorLabels;
  views: ScriptPreviewViews | undefined;
}) {
  const [state, setState] = useState(() =>
    EditorState.create({ doc: document, plugins: [...(views?.plugins ?? [])] }),
  );
  return (
    <DocumentEditor
      state={state}
      onStateChange={setState}
      template={template}
      layout="web"
      editable={false}
      nodeViews={views?.nodeViews}
      aria-label={labels.scriptPreview}
    />
  );
}

// What the preview says in place of an output, or null while it shows one.
function previewMessage(
  preview: ScriptPreviewState,
  labels: DocumentEditorLabels,
  blocked: boolean,
): string | null {
  if (preview.status === 'idle')
    return blocked ? labels.scriptPreviewBlocked : labels.scriptPreviewIdle;
  if (preview.status === 'running') return labels.scriptPreviewRunning;
  if (preview.status === 'error') return preview.message;
  return preview.document ? null : labels.scriptPreviewEmpty;
}

/**
 * The preview: a button that runs the script, then what it produced, or why it failed. While the
 * script has problems (`blocked`), it cannot run.
 */
export function ScriptPreview({
  template,
  labels,
  preview,
  onRefresh,
  blocked = false,
  views,
}: {
  template: TemplateFile;
  labels: DocumentEditorLabels;
  preview: ScriptPreviewState;
  onRefresh: () => void;
  blocked?: boolean | undefined;
  views?: ScriptPreviewViews | undefined;
}) {
  const message = previewMessage(preview, labels, blocked);
  const counters =
    preview.status === 'ready'
      ? ({ '--de-script-editor-counters': previewCounters(preview.counters) } as CSSProperties)
      : undefined;
  return (
    <div {...hooks.slot('preview', { status: preview.status })} style={counters}>
      <Button
        size="sm"
        startIcon={RefreshGlyph}
        isPending={preview.status === 'running'}
        isDisabled={blocked}
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
        <PreviewDocument
          document={preview.document}
          template={template}
          labels={labels}
          views={views}
        />
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
