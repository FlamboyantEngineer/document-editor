// The host's exports as File > Export runs them: each one at most once at a time, given the
// document as stored and its print snapshot once the pages are ready, the reader told through the
// host's feedback when it starts and how it ends, and every run aborted when the editor unmounts.

import type { EditorView } from 'prosemirror-view';
import { useEffect, useMemo, useRef, useState } from 'react';
import { documentSnapshotWhenReady } from '../../engine/index.js';
import type {
  DocumentExport,
  ExportRequest,
  FeedbackAdapter,
  HostResult,
} from '../../host/index.js';
import { writeDocumentFile } from '../../model/index.js';
import type { DocumentEditorProps } from './document-editor.js';
import type { DocumentEditorLabels } from './editor-labels.js';
import type { LayoutProgress } from './use-document-layout.js';

/** An export File > Export offers. */
export interface ExportEntry {
  readonly id: string;
  readonly label: string;
  /** Whether it is running, so it cannot run again until it ends. */
  readonly isRunning: boolean;
}

/** The exports File > Export offers, and running one. */
export interface DocumentExports {
  readonly entries: readonly ExportEntry[];
  /** Runs an export by its id, unless it is running; the labels word the feedback. */
  run(id: string, labels: DocumentEditorLabels): void;
}

/** What an export runs on, read when it starts. */
interface ExportSources {
  readonly props: DocumentEditorProps;
  readonly view: EditorView | null;
  readonly progress: LayoutProgress;
}

// The request an export is given: the document as the editor shows it now, and its snapshot.
function exportRequest(
  { props, view, progress }: ExportSources,
  signal: AbortSignal,
): ExportRequest {
  const references = props.referenceSource;
  return {
    content: writeDocumentFile(props.state.doc),
    snapshot: async (options = {}) => {
      if (!view) throw new Error('The editor is not mounted');
      return documentSnapshotWhenReady(view, {
        ...(references?.href
          ? { citationHref: (citation) => references.href?.(citation) ?? null }
          : {}),
        ...options,
        template: props.template,
        whenSettled: progress.whenSettled,
      });
    },
    signal,
  };
}

// Runs an export, telling the reader through the host's feedback when it starts and how it ends.
async function runExport(
  entry: DocumentExport,
  request: ExportRequest,
  { feedback, labels }: { feedback: FeedbackAdapter | undefined; labels: DocumentEditorLabels },
) {
  feedback?.notify({ tone: 'info', text: labels.exportStarted(entry.label) });
  let result: HostResult<void>;
  try {
    result = await entry.run(request);
  } catch (error) {
    result = { ok: false, error: { kind: 'unavailable', message: String(error) } };
  }
  if (request.signal.aborted) return;
  if (result.ok) feedback?.notify({ tone: 'success', text: labels.exportDone(entry.label) });
  else feedback?.notify({ tone: 'error', text: labels.exportFailed(entry.label, result.error) });
}

/** The host's exports for File > Export, from its `exports` adapter; none without it. */
export function useDocumentExports(
  props: DocumentEditorProps,
  view: EditorView | null,
  progress: LayoutProgress,
): DocumentExports {
  const [running, setRunning] = useState<ReadonlySet<string>>(() => new Set());
  // Read when a run starts: an export runs on the editor as it is then.
  const sources = useRef<ExportSources>({ props, view, progress });
  const started = useRef(new Set<string>());
  const [controller] = useState(() => new AbortController());
  useEffect(() => {
    sources.current = { props, view, progress };
  });
  useEffect(() => () => controller.abort(), [controller]);
  const exports = props.exports;
  return useMemo(() => {
    const done = (id: string) => {
      started.current.delete(id);
      if (controller.signal.aborted) return;
      setRunning((current) => new Set([...current].filter((each) => each !== id)));
    };
    return {
      entries: (exports?.entries ?? []).map(({ id, label }) => ({
        id,
        label,
        isRunning: running.has(id),
      })),
      run: (id, labels) => {
        const entry = exports?.entries.find((each) => each.id === id);
        // The guard holds from the click itself, before the running state renders.
        if (!entry || started.current.has(id)) return;
        started.current.add(id);
        setRunning((current) => new Set([...current, id]));
        const request = exportRequest(sources.current, controller.signal);
        const feedback = sources.current.props.feedback;
        void runExport(entry, request, { feedback, labels }).finally(() => done(id));
      },
    };
  }, [exports, running, controller]);
}
