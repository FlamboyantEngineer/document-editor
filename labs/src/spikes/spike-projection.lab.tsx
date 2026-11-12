// The paged projection's lab: a sample document, or that document repeated to hundreds of pages,
// shown by `createProjectionView`, where the canonical state takes every edit and a read-only
// projection shows the pages. `?copies=<n>` repeats the document.
//
// The page reports what the browser tests read on `window.projectionSpike`: the canonical
// document's text and selection, the projection's counts, each layout's time and each key's
// latency from the key press to the next frame.

import { toggleMark } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import type { Node } from 'prosemirror-model';
import { EditorState, type Selection } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import {
  createDocumentSchema,
  type DocumentFile,
  joinDocumentPages,
  readDocumentFile,
  sameStructure,
  type StoredNode,
} from '../../../src/model/index.js';
import { createProjectionView, type ProjectionView } from '../../../src/pagination/index.js';

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
  editor: LabEditor | null;
}

/** The projection as the browser tests drive it. */
interface LabEditor {
  readonly canonical: EditorState;
  layout(): void;
}

/** What the lab counts of the projection: its own counts, and each layout's time. */
interface LabStats {
  layouts: number;
  layoutMs: number[];
  /** Layouts after which the projection's pages did not join into the canonical document. */
  outOfSync: number;
  /** Canonical changes that could not be mirrored, which laid the pages out at once. */
  resyncs: number;
  refused: number;
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

// Times each layout the projection schedules, on the next frame as by default.
function timedFrame(times: number[]) {
  return (run: () => void) => {
    const handle = requestAnimationFrame(() => {
      const started = performance.now();
      run();
      times.push(performance.now() - started);
    });
    return () => cancelAnimationFrame(handle);
  };
}

function mountProjection(doc: Node, mount: HTMLElement, measureIn: HTMLElement): () => LabStats {
  const { schema } = doc.type;
  const layoutMs: number[] = [];
  let outOfSync = 0;
  // The first layout runs as the projection is made, before it is assigned.
  let shown: ProjectionView | null = null;
  const projection = createProjectionView({
    mount,
    measureIn,
    state: EditorState.create({ doc: joinDocumentPages(doc).doc, plugins: [history()] }),
    pageHeight: PAGE_HEIGHT,
    keys: {
      'Mod-z': undo,
      'Mod-y': redo,
      'Shift-Mod-z': redo,
      ...(schema.marks.bold ? { 'Mod-b': toggleMark(schema.marks.bold) } : {}),
      ...(schema.marks.italic ? { 'Mod-i': toggleMark(schema.marks.italic) } : {}),
    },
    schedule: timedFrame(layoutMs),
    onLayout() {
      if (shown) {
        const joined = joinDocumentPages(shown.view.state.doc).doc;
        if (!sameStructure(joined, shown.state.doc)) outOfSync += 1;
      }
      markReady();
    },
  });
  shown = projection;
  editor = {
    get canonical() {
      return projection.state;
    },
    layout: projection.layout,
  };
  return () => {
    const { layouts, relaid, refused } = projection.stats();
    return { layouts, layoutMs, outOfSync, resyncs: relaid, refused };
  };
}

let editor: LabEditor | null = null;

function render(): void {
  const mount = document.querySelector<HTMLElement>('.lab-pages');
  const measureIn = document.querySelector<HTMLElement>('.lab-measure');
  if (!mount || !measureIn) return;
  const params = new URLSearchParams(window.location.search);
  const copies = Math.max(1, Number(params.get('copies') ?? 1) || 1);
  const doc = readDocumentFile(sample(copies), createDocumentSchema()).doc;
  const latencies: number[] = [];
  const longTasks: number[] = [];
  timeKeys(latencies);
  timeLongTasks(longTasks);
  const probe: Probe = {
    latencies,
    longTasks,
    pages: pageCount,
    canonicalSelection() {
      const state = probe.editor?.canonical;
      if (!state) throw new Error('no editor');
      return selectionReport(state.doc, state.selection);
    },
    columnWidths(id) {
      const state = probe.editor?.canonical;
      return state ? columnWidths(state.doc, id) : [];
    },
    inSync: () => stats().outOfSync === 0,
    stats: () => stats(),
    get editor() {
      return editor;
    },
  };
  window.projectionSpike = probe;
  const stats = mountProjection(doc, mount, measureIn);
}

render();
