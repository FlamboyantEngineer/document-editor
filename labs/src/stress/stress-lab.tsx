// The stress labs' page: a generated document in the document editor with its toolbar, status bar
// and scrolling frame, proofed by a word-list proofer, and the time its pages took to settle, first
// and after the latest edit. A size picker builds a larger document.

import { EditorState, type Transaction } from 'prosemirror-state';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DocumentEditor,
  type DocumentEditorHandle,
  type DocumentLayout,
} from '../../../src/components/index.js';
import {
  assignElementIds,
  createContents,
  createDocumentEditing,
  createProofing,
} from '../../../src/engine/index.js';
import { createWordListProofer } from '../../../src/host/index.js';
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

const TEMPLATE = resolveTemplateFile(BASE_TEMPLATE, {
  loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
  baseTemplateId: BASE_TEMPLATE_ID,
});

const PROOFER = createWordListProofer({ corrections: { teh: ['the'], recieve: ['receive'] } });

/** A stress lab's document, by the size the reader picks. */
export interface StressLabOptions {
  /** Builds the document of a size. */
  readonly build: (size: number) => DocumentFile;
  /** The sizes the reader can pick, the first shown on load; none for a document of one size. */
  readonly sizes?: readonly { readonly label: string; readonly value: number }[];
}

function stateOf(file: DocumentFile): EditorState {
  const schema = createDocumentSchema();
  const state = EditorState.create({
    doc: readDocumentFile(file, schema),
    plugins: [
      createContents({ template: () => TEMPLATE }),
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
  const [times, setTimes] = useState<{ first: number | null; latest: number | null }>({
    first: null,
    latest: null,
  });
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
          ? { first: settled - started.current, latest: null }
          : { ...current, latest: since === null ? current.latest : settled - since },
      );
    });
  };
  const restart = () => {
    started.current = performance.now();
    edited.current = null;
    setTimes({ first: null, latest: null });
  };
  return { times, onTransaction, restart };
}

const milliseconds = (value: number | null) =>
  value === null ? '…' : `${String(Math.round(value))} ms`;

function StressLab({ build, sizes }: StressLabOptions) {
  const [size, setSize] = useState(sizes?.[0]?.value ?? 1);
  const [state, setState] = useState(() => stateOf(build(size)));
  const [layout, setLayout] = useState<DocumentLayout>('page');
  const handle = useRef<DocumentEditorHandle>(null);
  const layoutTimes = useLayoutTimes(handle);
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
        toolbar
        scrollable
        statusBar
        className="lab-document-editor"
        aria-label="Stress document"
        handleRef={handle}
        events={events}
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
