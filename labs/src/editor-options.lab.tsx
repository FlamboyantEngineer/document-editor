// The options a host sets on the editing, the schema and the document editor, each with a control:
// a content limit (`limit`) whose words show in the status bar against it, a collaborator's change
// taking it past; a trailing paragraph after a section's last table (`trailingParagraph`); the
// typing shortcuts by group (`typingRules`); the host's own layout rules (`layoutRules`) keeping
// tables whole; the host's presentation in the schema (`DocumentSchemaOptions`): a tooltip
// attribute, a mention class, asset previews as of a time and an identity attribute, the review
// state of an element lifecycle stamping drafts and locking approved elements; a document opened
// with broken element ids, repaired on opening (`repairIds`); a dialog whose code fails to load
// through a dropped connection; and a status item of the host's that reads a part of the editor's
// state (`useDocumentEditorState`).

import { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DocumentEditor,
  type DocumentStatusBarOptions,
  useDocumentEditorState,
} from '../../src/components/index.js';
import {
  assignElementIds,
  type ContentLimit,
  createDocumentEditing,
  documentCounts,
  ELEMENT_IDS_REPAIR,
  markRemote,
} from '../../src/engine/index.js';
import type { FeedbackAdapter } from '../../src/host/index.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  createDocumentSchema,
  type DocumentFile,
  type LayoutRules,
  readDocumentFile,
  resolveTemplateFile,
} from '../../src/model/index.js';
import { failNextDialogLoad, startDialogNetwork } from './dialog-network.js';
import {
  assetsTime,
  brokenIdsFile,
  elementIdReport,
  HOST_SCHEMA,
  isApproved,
  reviewedAt,
  sampleFile,
  setReviewState,
  stampDrafts,
} from './editor-options-document.js';
import { markReadyWhenSettled } from './lab-ready.js';
import { LAB_FONTS } from './served-fonts.js';

const SCHEMA = createDocumentSchema({ schema: HOST_SCHEMA });

// The base template with the sample's appendix section.
const TEMPLATE = resolveTemplateFile(
  {
    formatVersion: 1,
    id: 'editor-options',
    parent: BASE_TEMPLATE_ID,
    sections: [{ name: 'appendix' }],
  },
  {
    loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
    baseTemplateId: BASE_TEMPLATE_ID,
  },
);

type LimitChoice = 'none' | 'words' | 'characters';

interface EditingChoices {
  readonly limit: LimitChoice;
  readonly trailingParagraph: boolean;
  readonly blocks: boolean;
  readonly marks: boolean;
  readonly typography: boolean;
}

const DEFAULT_CHOICES: EditingChoices = {
  limit: 'none',
  trailingParagraph: false,
  blocks: true,
  marks: true,
  typography: true,
};

// A limit a little above what the document holds now, so a few more words reach it.
function limitFor(choice: LimitChoice, state: EditorState): ContentLimit | undefined {
  const counts = documentCounts(state.doc);
  if (choice === 'words') return { words: counts.words + 5 };
  if (choice === 'characters') return { characters: counts.characters + 30 };
  return undefined;
}

function pluginsFor(choices: EditingChoices, state: EditorState) {
  return [
    stampDrafts,
    ...createDocumentEditing(SCHEMA, {
      template: () => TEMPLATE,
      author: () => 'lab',
      isLocked: isApproved,
      limit: limitFor(choices.limit, state),
      trailingParagraph: choices.trailingParagraph,
      typingRules: { blocks: choices.blocks, marks: choices.marks, typography: choices.typography },
    }),
  ];
}

// A document as the host stored it, with the editing chosen; the sample with every id given.
function open(file: DocumentFile, choices: EditingChoices, withIds = false): EditorState {
  let opened = EditorState.create({ doc: readDocumentFile(file, SCHEMA).doc });
  if (withIds) {
    const tr = opened.tr;
    assignElementIds(tr, {});
    opened = opened.apply(tr);
  }
  return opened.reconfigure({ plugins: pluginsFor(choices, opened) });
}

// The host's layout rule: a table never splits, so it moves to the next page whole.
const WHOLE_TABLES: LayoutRules = {
  table: { keepsWithHeading: true },
  table_figure: { keepsWithHeading: true },
};

// A status item of the host's that draws only when the block at the caret changes type, and
// counts how often it drew.
const CaretBlock = memo(function CaretBlock() {
  const block = useDocumentEditorState((editor) => editor.state.selection.$from.parent.type.name);
  const draws = useRef(0);
  const count = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    draws.current += 1;
    if (count.current) count.current.textContent = String(draws.current);
  });
  return (
    <span aria-label="Caret block">
      In {block ?? 'nothing'}, drawn <span ref={count}>0</span> times
    </span>
  );
});

const STATUS_BAR: DocumentStatusBarOptions = {
  arrange: (items) => [...items, { id: 'caret-block', side: 'start', content: <CaretBlock /> }],
};

function Lab() {
  const [choices, setChoices] = useState(DEFAULT_CHOICES);
  const [state, setState] = useState(() => open(sampleFile(), DEFAULT_CHOICES, true));
  const [view, setView] = useState<EditorView | null>(null);
  const [wholeTables, setWholeTables] = useState(false);
  const [repairIds, setRepairIds] = useState(true);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [networkReady, setNetworkReady] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const record = (entry: string) => setLog((entries) => [entry, ...entries].slice(0, 20));
  useEffect(() => {
    void startDialogNetwork().then(setNetworkReady);
  }, []);
  const choose = (next: Partial<EditingChoices>) => {
    const all = { ...choices, ...next };
    setChoices(all);
    setState((current) => current.reconfigure({ plugins: pluginsFor(all, current) }));
  };
  const openFile = (file: DocumentFile, withIds = false) => setState(open(file, choices, withIds));
  const showAssetsAsOf = (value: string | null) => {
    assetsTime.asOf = value;
    setAsOf(value);
  };
  const addCollaboratorText = () => {
    if (!view) return;
    const paragraph = SCHEMA.nodes.paragraph?.create(
      null,
      SCHEMA.text('A collaborator added this paragraph of several more words to the survey.'),
    );
    if (!paragraph) return;
    // After the sample's third paragraph, or at the start of the document.
    let at = 0;
    view.state.doc.descendants((node, pos) => {
      if (node.attrs.dataId === 'a0f00003') at = pos + node.nodeSize;
      return !at;
    });
    if (at) view.dispatch(markRemote(view.state.tr.insert(at, paragraph)));
  };
  const review = (value: string) => {
    if (!view) return;
    const tr = setReviewState(view.state, value);
    if (tr) view.dispatch(tr);
    view.focus();
  };
  const feedback = useMemo<FeedbackAdapter>(
    () => ({ notify: ({ tone, text }) => record(`feedback ${tone}: ${text}`) }),
    [],
  );
  const reviewed = reviewedAt(state);
  return (
    <>
      <div className="lab-controls">
        <fieldset>
          <legend>Editing</legend>
          <label>
            Content limit{' '}
            <select
              value={choices.limit}
              onChange={(event) => choose({ limit: event.currentTarget.value as LimitChoice })}
            >
              <option value="none">None</option>
              <option value="words">5 words more than now</option>
              <option value="characters">30 characters more than now</option>
            </select>
          </label>{' '}
          <button type="button" onClick={addCollaboratorText}>
            Add a collaborator&apos;s paragraph
          </button>{' '}
          <label>
            <input
              type="checkbox"
              checked={choices.trailingParagraph}
              onChange={(event) => choose({ trailingParagraph: event.currentTarget.checked })}
            />{' '}
            Trailing paragraph
          </label>
          {(['blocks', 'marks', 'typography'] as const).map((group) => (
            <label key={group}>
              {' '}
              <input
                type="checkbox"
                checked={choices[group]}
                onChange={(event) => choose({ [group]: event.currentTarget.checked })}
              />{' '}
              Typing shortcuts: {group}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Layout and presentation (host)</legend>
          <label>
            <input
              type="checkbox"
              checked={wholeTables}
              onChange={(event) => setWholeTables(event.currentTarget.checked)}
            />{' '}
            Keep tables whole on a page
          </label>{' '}
          <label>
            Assets as of{' '}
            <select
              value={asOf ?? ''}
              onChange={(event) => showAssetsAsOf(event.currentTarget.value || null)}
            >
              <option value="">Now</option>
              <option value="2026-01-31">31 January 2026</option>
            </select>
          </label>
        </fieldset>
        <fieldset>
          <legend>Element lifecycle (host)</legend>
          <output aria-label="Review state">
            {reviewed
              ? `${reviewed.node.type.name}: ${String(reviewed.node.attrs.reviewState ?? 'none')}`
              : 'No element at the caret'}
          </output>{' '}
          <button type="button" onClick={() => review('approved')} disabled={!reviewed}>
            Approve the element at the caret
          </button>{' '}
          <button type="button" onClick={() => review('draft')} disabled={!reviewed}>
            Return it to draft
          </button>
        </fieldset>
        <fieldset>
          <legend>Opening</legend>
          <label>
            <input
              type="checkbox"
              checked={repairIds}
              onChange={(event) => setRepairIds(event.currentTarget.checked)}
            />{' '}
            Repair element ids on opening
          </label>{' '}
          <button type="button" onClick={() => openFile(brokenIdsFile())}>
            Open a document with broken ids
          </button>{' '}
          <button type="button" onClick={() => openFile(sampleFile(), true)}>
            Open the sample
          </button>{' '}
          <output aria-label="Element ids">{elementIdReport(state.doc)}</output>
        </fieldset>
        <fieldset>
          <legend>Network (host)</legend>
          <button
            type="button"
            disabled={!networkReady}
            onClick={() =>
              void failNextDialogLoad().then((armed) =>
                record(armed ? 'network: the next dialog fails to load' : 'network: not armed'),
              )
            }
          >
            Drop the connection for the next dialog
          </button>
        </fieldset>
        <fieldset>
          <legend>What the editor told the host</legend>
          <ol aria-label="Host log">
            {log.map((entry, index) => (
              <li key={`${String(index)}-${entry}`}>{entry}</li>
            ))}
          </ol>
        </fieldset>
      </div>
      <DocumentEditor
        state={state}
        onStateChange={setState}
        template={TEMPLATE}
        author="lab"
        toolbar
        menubar
        statusBar={STATUS_BAR}
        fonts={LAB_FONTS}
        layoutRules={wholeTables ? WHOLE_TABLES : undefined}
        repairIds={repairIds ? { author: 'system' } : false}
        feedback={feedback}
        aria-label="Sample document"
        events={{ onMounted: setView }}
        // A host shows the document as of another time in a view of its own, its images drawn anew.
        key={asOf ?? 'now'}
        onContentChange={(tr) => {
          if (tr.getMeta(ELEMENT_IDS_REPAIR) === true) record('ids repaired on opening');
        }}
      />
    </>
  );
}

const container = document.querySelector('#lab-editor');
if (container) {
  createRoot(container).render(<Lab />);
  markReadyWhenSettled();
}
