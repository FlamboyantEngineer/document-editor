// The stress labs' page: a generated document in the document editor with its toolbar, status bar
// and scrolling frame, proofed by a word-list proofer and completed inline, and the time its pages took to settle, first
// and after the latest edit. A size picker builds a larger document.

import { EditorState, type Transaction } from 'prosemirror-state';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DocumentEditor,
  type DocumentEditorHandle,
  type DocumentLayout,
  inlineCompletionItem,
} from '../../../src/components/index.js';
import {
  assignElementIds,
  createContents,
  createDocumentEditing,
  createInlineCompletion,
  createProofing,
} from '../../../src/engine/index.js';
import {
  type CommentThread,
  type CompletionAdapter,
  createMemoryHost,
  createWordListProofer,
} from '../../../src/host/index.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  createDocumentSchema,
  type DocumentFile,
  readDocumentFile,
  resolveTemplateFile,
} from '../../../src/model/index.js';
import { isPaginationTransaction } from '../../../src/pagination/index.js';
import { markReadyWhenSettled } from '../lab-ready.js';
import { useRemoteTypist, useStressProbe } from './stress-probe.js';

const TEMPLATE = resolveTemplateFile(BASE_TEMPLATE, {
  loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
  baseTemplateId: BASE_TEMPLATE_ID,
});

const PROOFER = createWordListProofer({ corrections: { teh: ['the'], recieve: ['receive'] } });

// A provider that offers the same few words after every pause, so the typing budgets count what
// completion costs each key: asking, the offer drawn, and the next key dismissing it.
const COMPLETER: CompletionAdapter = {
  agent: 'lab-assistant',
  complete: () =>
    Promise.resolve({ ok: true, value: { text: ' as planned.', session: 'lab-completion' } }),
};

// The editor's toolbar with the completion toggle a host that completes adds.
const TOOLBAR = { items: [inlineCompletionItem()] };

/** A stress lab's document, by the size the reader picks. */
export interface StressLabOptions {
  /** Builds the document of a size. */
  readonly build: (size: number) => DocumentFile;
  /**
   * The sizes the reader can pick, the first shown on load unless the page's `size` query
   * parameter names another; none for a document of one size.
   */
  readonly sizes?: readonly { readonly label: string; readonly value: number }[];
  /** Offers a remote writer typing into the middle of the document. */
  readonly remote?: boolean | undefined;
  /** The comment threads of a size's document, shown in the margin; none for sizes without. */
  readonly threads?: ((size: number) => readonly CommentThread[] | null) | undefined;
}

// An in-memory host keeping a size's comment threads, or none.
function useReviewHost(threads: StressLabOptions['threads'], size: number) {
  return useMemo(() => {
    const listed = threads?.(size);
    if (!listed) return null;
    return createMemoryHost({
      person: { id: 'lab', name: 'Lab Writer' },
      people: [{ id: 'reviewer', name: 'Reviewer' }],
      comments: { threads: { scale: [...listed] } },
    });
  }, [threads, size]);
}

// The size shown on load: the one the query names, or the first.
function initialSize(sizes: StressLabOptions['sizes']): number {
  const asked = Number(new URLSearchParams(window.location.search).get('size'));
  return sizes?.find(({ value }) => value === asked)?.value ?? sizes?.[0]?.value ?? 1;
}

function stateOf(file: DocumentFile): EditorState {
  const schema = createDocumentSchema();
  const state = EditorState.create({
    doc: readDocumentFile(file, schema).doc,
    plugins: [
      createContents({ template: () => TEMPLATE }),
      createInlineCompletion({ provider: COMPLETER }),
      createProofing({ proofer: PROOFER }),
      ...createDocumentEditing(schema, { template: () => TEMPLATE, author: () => 'lab' }),
    ],
  });
  const tr = state.tr;
  assignElementIds(tr, {});
  // The ids a document opens with are no edit of the writer's to undo.
  return state.apply(tr.setMeta('addToHistory', false));
}

// The time the pages took to settle (`whenSettled`): from the start, and from the latest edit.
function useLayoutTimes(handle: RefObject<DocumentEditorHandle | null>) {
  const [times, setTimes] = useState<{
    first: number | null;
    latest: number | null;
    settledAt: number | null;
  }>({ first: null, latest: null, settledAt: null });
  const started = useRef(0);
  useEffect(() => {
    started.current = performance.now();
  }, []);
  const edited = useRef<number | null>(null);
  const onTransaction = (tr: Transaction) => {
    const now = performance.now();
    if (!isPaginationTransaction(tr)) {
      if (tr.docChanged) edited.current = now;
      return;
    }
    const since = edited.current;
    void handle.current?.whenSettled().then(() => {
      const settled = performance.now();
      setTimes((current) =>
        current.first === null
          ? { first: settled - started.current, latest: null, settledAt: settled }
          : { ...current, latest: since === null ? current.latest : settled - since },
      );
    });
  };
  const restart = () => {
    started.current = performance.now();
    edited.current = null;
    setTimes({ first: null, latest: null, settledAt: null });
  };
  return { times, onTransaction, restart };
}

const milliseconds = (value: number | null) =>
  value === null ? '…' : `${String(Math.round(value))} ms`;

function StressLab({ build, sizes, remote, threads }: StressLabOptions) {
  const [size, setSize] = useState(() => initialSize(sizes));
  const [state, setState] = useState(() => stateOf(build(size)));
  const [layout, setLayout] = useState<DocumentLayout>('page');
  const review = useReviewHost(threads, size);
  const handle = useRef<DocumentEditorHandle>(null);
  const layoutTimes = useLayoutTimes(handle);
  useStressProbe(handle, layoutTimes.times.settledAt);
  const typist = useRemoteTypist(handle);
  const events = useMemo(() => ({ onTransaction: layoutTimes.onTransaction }), [layoutTimes]);
  const blocks = useMemo(() => {
    let count = 0;
    state.doc.descendants((node) => {
      if (node.isTextblock) count += 1;
      return !node.isTextblock;
    });
    return count;
  }, [state.doc]);
  const pick = (value: number) => {
    setSize(value);
    layoutTimes.restart();
    setState(stateOf(build(value)));
  };
  return (
    <>
      <fieldset>
        <legend>View</legend>
        {sizes ? (
          <label>
            Size{' '}
            <select
              name="size"
              value={size}
              onChange={(event) => pick(Number(event.currentTarget.value))}
            >
              {sizes.map(({ label, value }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {(['page', 'web'] as const).map((value) => (
          <label key={value}>
            <input
              type="radio"
              name="layout"
              value={value}
              checked={layout === value}
              onChange={() => setLayout(value)}
            />{' '}
            {value === 'page' ? 'Pages' : 'Web layout'}
          </label>
        ))}
        {remote ? (
          <label>
            <input
              type="checkbox"
              name="remote-typist"
              checked={typist.typing}
              onChange={(event) => typist.setTyping(event.currentTarget.checked)}
            />{' '}
            Remote typist
          </label>
        ) : null}
        <output className="lab-stress-metrics" aria-label="Layout times">
          {blocks} blocks · first layout {milliseconds(layoutTimes.times.first)} · after the latest
          edit {milliseconds(layoutTimes.times.latest)}
        </output>
      </fieldset>
      <DocumentEditor
        state={state}
        onStateChange={setState}
        template={TEMPLATE}
        layout={layout}
        toolbar={TOOLBAR}
        scrollable
        statusBar
        className="lab-document-editor"
        aria-label="Stress document"
        handleRef={handle}
        events={events}
        comments={
          review?.comments
            ? { store: review.comments, documentId: 'scale', identity: review.identity }
            : undefined
        }
      />
    </>
  );
}

/** Mounts a stress lab in `#lab-editor`. */
export function mountStressLab(options: StressLabOptions): void {
  const container = document.querySelector('#lab-editor');
  if (!container) return;
  createRoot(container).render(<StressLab {...options} />);
  markReadyWhenSettled();
}
