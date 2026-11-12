// The paged projection spike's lab: a sample document, or that document repeated to hundreds of
// pages, in the spike's editor, where the canonical state takes every edit and a read-only
// projection shows the pages. `?copies=<n>` repeats the document; `?mode=current` opens it in
// today's editor, kept paginated by `createPagination`, to compare typing latency.
//
// The page reports what the browser tests read on `window.projectionSpike`: the canonical
// document's text and selection, the spike's counts, each layout's time and each key's latency
// from the key press to the next frame.

import { baseKeymap } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import type { Node } from 'prosemirror-model';
import { EditorState, type Selection } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import { EditorView } from 'prosemirror-view';
import {
  createDocumentSchema,
  type DocumentFile,
  readDocumentFile,
  type StoredNode,
} from '../../../src/model/index.js';
import { createPagination, isPaginationTransaction } from '../../../src/pagination/index.js';
import { createProjectionEditor, type ProjectionEditor } from './projection-editor.js';

const PAGE_HEIGHT = 360;

const SENTENCES = [
  'The survey covered every room on the ground floor and two on the first.',
  'Each reading was taken twice, an hour apart, and the second reading was kept.',
  'Where the two readings differed by more than a tenth, a third was taken.',
  'The notes below list the rooms in the order they were visited.',
];

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const sentences = (count: number, from = 0) =>
  Array.from({ length: count }, (_, index) => SENTENCES[(from + index) % SENTENCES.length]).join(
    ' ',
  );
const paragraph = (id: string, count: number, from = 0): StoredNode => ({
  type: 'paragraph',
  attrs: { id },
  content: [text(sentences(count, from))],
});
const row = (cell: 'tableCell' | 'tableHeader', values: string[]): StoredNode => ({
  type: 'tableRow',
  content: values.map((value) => ({
    type: cell,
    content: [{ type: 'paragraph', content: [text(value)] }],
  })),
});

// One copy of the sample: a heading, long paragraphs that split, a footnote and a table of rooms
// that splits with its header repeated.
function copy(index: number): StoredNode[] {
  const id = (name: string) => `${name}-${String(index)}`;
  return [
    {
      type: 'heading',
      attrs: { id: id('h'), level: 1 },
      content: [text(`Survey ${String(index + 1)}`)],
    },
    paragraph(id('p1'), 9),
    {
      type: 'paragraph',
      attrs: { id: id('f') },
      content: [
        text('Readings were taken with a calibrated meter.'),
        {
          type: 'footnote',
          attrs: { id: id('n') },
          content: [text('The meter was calibrated the morning of the survey.')],
        },
        text(` ${sentences(2, 1)}`),
      ],
    },
    paragraph(id('p2'), 14, 2),
    {
      type: 'table',
      attrs: { id: id('t') },
      content: [
        row('tableHeader', ['Room', 'Reading']),
        ...Array.from({ length: 18 }, (_, at) =>
          row('tableCell', [`Room ${String(at + 1)}`, String(at * 3)]),
        ),
      ],
    },
    paragraph(id('p3'), 6, 3),
  ];
}

function sample(copies: number): DocumentFile {
  return {
    formatVersion: 1,
    sections: [
      { name: null, content: Array.from({ length: copies }, (_, index) => copy(index)).flat() },
    ],
  };
}

interface Probe {
  mode: 'spike' | 'current';
  /** Each key's time from its press to the next frame, in milliseconds. */
  latencies: number[];
  /** The main thread's tasks over 50 milliseconds, such as layouts, in milliseconds. */
  longTasks: number[];
  pages(): number;
  /** The canonical document's text between two positions, and its selection. */
  canonicalSelection(): {
    from: number;
    to: number;
    text: string;
    cells: number;
    before: string;
    after: string;
  };
  /** The canonical table's column widths, by table id. */
  columnWidths(id: string): (number[] | null)[];
  inSync(): boolean;
  stats(): unknown;
  editor: ProjectionEditor | null;
}

declare global {
  interface Window {
    projectionSpike?: Probe;
  }
}

// Times each key from its press to the frame after it was handled.
function timeKeys(latencies: number[]): void {
  window.addEventListener(
    'keydown',
    (event) => {
      const pressed = event.timeStamp;
      requestAnimationFrame(() => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => latencies.push(performance.now() - pressed);
        channel.port2.postMessage(null);
      });
    },
    true,
  );
}

// Records the main thread's long tasks: a key pressed during one waits for it to end.
function timeLongTasks(durations: number[]): void {
  if (!PerformanceObserver.supportedEntryTypes.includes('longtask')) return;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) durations.push(entry.duration);
  }).observe({ type: 'longtask' });
}

function selectionReport(doc: Node, selection: Selection) {
  const { from, to } = selection;
  let cells = 0;
  if (selection instanceof CellSelection) selection.forEachCell(() => (cells += 1));
  return {
    from,
    to,
    text: doc.textBetween(from, to, '\n'),
    cells,
    before: doc.textBetween(Math.max(from - 12, doc.resolve(from).start()), from),
    after: doc.textBetween(to, Math.min(to + 12, doc.resolve(to).end())),
  };
}

function columnWidths(doc: Node, id: string): (number[] | null)[] {
  const widths: (number[] | null)[] = [];
  doc.descendants((node) => {
    if (node.type.name !== 'table') return true;
    if (node.attrs.dataId !== id) return false;
    node.forEach((tableRow) => {
      tableRow.forEach((cell) => widths.push((cell.attrs.colwidth as number[] | null) ?? null));
    });
    return false;
  });
  return widths;
}

const pageCount = () => document.querySelectorAll('.lab-pages .pm-page').length;

function markReady(): void {
  const { dataset } = document.documentElement;
  dataset.labPages = String(pageCount());
  dataset.labLayouts = String(Number(dataset.labLayouts ?? 0) + 1);
  dataset.labReady = 'true';
}

function mountSpike(doc: Node, mount: HTMLElement, measureIn: HTMLElement, probe: Probe): void {
  probe.editor = createProjectionEditor({
    mount,
    measureIn,
    doc,
    pageHeight: PAGE_HEIGHT,
    onLayout: markReady,
  });
}

function mountCurrent(doc: Node, mount: HTMLElement, measureIn: HTMLElement): EditorView {
  const pagination = createPagination({ measureIn, pageHeight: PAGE_HEIGHT });
  const view: EditorView = new EditorView(mount, {
    state: EditorState.create({
      doc,
      plugins: [
        pagination.plugin,
        history(),
        keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Shift-Mod-z': redo }),
        keymap(baseKeymap),
      ],
    }),
    dispatchTransaction(tr) {
      view.updateState(view.state.apply(tr));
      if (isPaginationTransaction(tr)) markReady();
    },
  });
  return view;
}

function render(): void {
  const mount = document.querySelector<HTMLElement>('.lab-pages');
  const measureIn = document.querySelector<HTMLElement>('.lab-measure');
  if (!mount || !measureIn) return;
  const params = new URLSearchParams(window.location.search);
  const copies = Math.max(1, Number(params.get('copies') ?? 1) || 1);
  const mode = params.get('mode') === 'current' ? 'current' : 'spike';
  document.documentElement.dataset.labMode = mode;
  const doc = readDocumentFile(sample(copies), createDocumentSchema()).doc;
  const latencies: number[] = [];
  const longTasks: number[] = [];
  timeKeys(latencies);
  timeLongTasks(longTasks);
  let current: EditorView | null = null;
  const probe: Probe = {
    mode,
    latencies,
    longTasks,
    pages: pageCount,
    canonicalSelection() {
      const state = probe.editor?.canonical ?? current?.state;
      if (!state) throw new Error('no editor');
      return selectionReport(state.doc, state.selection);
    },
    columnWidths(id) {
      const state = probe.editor?.canonical ?? current?.state;
      return state ? columnWidths(state.doc, id) : [];
    },
    inSync: () => (probe.editor ? probe.editor.stats.outOfSync === 0 : true),
    stats: () => probe.editor?.stats ?? null,
    editor: null,
  };
  window.projectionSpike = probe;
  if (mode === 'spike') mountSpike(doc, mount, measureIn, probe);
  else current = mountCurrent(doc, mount, measureIn);
}

render();
