// Shows a sample document on fixed-height pages in an editor view. Its whole document is measured
// in a hidden view and laid out, and the editor moves onto each new layout by steps: after every
// edit, and when the page width changes, with the caret staying on its text and undo undoing edits.

import { baseKeymap } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import type { Node } from 'prosemirror-model';
import { EditorState, type Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import {
  createDocumentSchema,
  type DocumentFile,
  joinDocumentPages,
  layoutPages,
  projectDocument,
  readDocumentFile,
  repaginate,
  type SectionPages,
  type StoredNode,
} from '../../src/model/index.js';
import { measureChildBlocks } from '../../src/pagination/index.js';

/** The content height of each page, in pixels. */
const PAGE_HEIGHT = 360;

const SENTENCES = [
  'The survey covered every room on the ground floor and two on the first.',
  'Each reading was taken twice, an hour apart, and the second reading was kept.',
  'Where the two readings differed by more than a tenth, a third was taken.',
  'The notes below list the rooms in the order they were visited.',
];

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const paragraph = (id: string, sentences: number): StoredNode => ({
  type: 'paragraph',
  attrs: { id },
  content: [
    text(
      Array.from({ length: sentences }, (_, index) => SENTENCES[index % SENTENCES.length]).join(
        ' ',
      ),
    ),
  ],
});
const item = (id: string, value: string): StoredNode => ({
  type: 'listItem',
  attrs: { id },
  content: [{ type: 'paragraph', content: [text(value)] }],
});
const row = (cell: 'tableCell' | 'tableHeader', values: string[]): StoredNode => ({
  type: 'tableRow',
  content: values.map((value) => ({
    type: cell,
    content: [{ type: 'paragraph', content: [text(value)] }],
  })),
});

const SAMPLE: DocumentFile = {
  formatVersion: 1,
  sections: [
    {
      name: null,
      content: [
        { type: 'heading', attrs: { id: 'h1', level: 1 }, content: [text('Survey notes')] },
        paragraph('p1', 6),
        paragraph('p2', 12),
        { type: 'heading', attrs: { id: 'h2', level: 2 }, content: [text('Rooms')] },
        {
          type: 'orderedList',
          attrs: { id: 'l1' },
          content: Array.from({ length: 14 }, (_, index) =>
            item(`i${String(index)}`, `Room ${String(index + 1)}: ${SENTENCES[index % 4] ?? ''}`),
          ),
        },
        {
          type: 'codeBlock',
          attrs: { id: 'c1' },
          content: [
            text(
              Array.from(
                { length: 24 },
                (_, index) => `reading ${String(index + 1)} = ${String(index * 7)}`,
              ).join('\n'),
            ),
          ],
        },
        {
          type: 'table',
          attrs: { id: 't1' },
          content: [
            row('tableHeader', ['Room', 'Reading']),
            ...Array.from({ length: 16 }, (_, index) =>
              row('tableCell', [`Room ${String(index + 1)}`, String(index * 3)]),
            ),
          ],
        },
        paragraph('p3', 8),
      ],
    },
  ],
};

// Where each section's page content starts.
function contentPositions(doc: Node): number[] {
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'page_content') positions.push(pos);
    return (
      node.type.name === 'doc' || node.type.name === 'page_section' || node.type.name === 'page'
    );
  });
  return positions;
}

/** The pages wide and narrow, in pixels. */
const WIDTHS = { wide: 480, narrow: 340 } as const;

interface Lab {
  readonly measuring: EditorView;
  readonly editor: EditorView;
}

// Measures the whole document in the hidden view and lays each section out on pages.
function layOut(measuring: EditorView, whole: Node): SectionPages[] {
  measuring.updateState(EditorState.create({ doc: whole }));
  return contentPositions(whole).map((pos) =>
    layoutPages(measureChildBlocks(measuring, pos), { pageHeight: PAGE_HEIGHT }).map((page) =>
      page.map((block) => block.node),
    ),
  );
}

// Whether two whole documents hold the same content, whatever their page numbers.
function sameContent(left: Node, right: Node): boolean {
  const contents = (doc: Node) => contentPositions(doc).map((pos) => doc.nodeAt(pos));
  const rightContents = contents(right);
  return contents(left).every((content, index) => {
    const other = rightContents[index];
    return Boolean(content && other?.eq(content));
  });
}

// Records what a test reads: whether the pages join back into the whole document they were laid out
// from, the text at the caret, and how many pages there are.
function reportCaret({ state }: EditorView): void {
  const { from } = state.selection;
  document.documentElement.dataset.labCaretText = state.doc.textBetween(from, from + 12);
}

function report(lab: Lab, whole: Node): void {
  const { dataset } = document.documentElement;
  dataset.labJoinsWhole = String(sameContent(joinDocumentPages(lab.editor.state.doc).doc, whole));
  reportCaret(lab.editor);
  dataset.labPages = String(document.querySelectorAll('.lab-pages .pm-page').length);
}

const PAGINATION = 'lab-pagination';

// Lays the editor's document out again and steps the editor onto the new pages.
function repaginateEditor(lab: Lab): void {
  const { state } = lab.editor;
  const whole = joinDocumentPages(state.doc).doc;
  const target = projectDocument(whole, layOut(lab.measuring, whole));
  const tr = state.tr;
  repaginate(tr, target);
  if (tr.docChanged) {
    lab.editor.dispatch(tr.setMeta(PAGINATION, true).setMeta('addToHistory', false));
  }
  report(lab, whole);
}

function setWidth(lab: Lab, button: HTMLButtonElement): void {
  const narrow = button.getAttribute('aria-pressed') !== 'true';
  button.setAttribute('aria-pressed', String(narrow));
  const width = narrow ? WIDTHS.narrow : WIDTHS.wide;
  document.documentElement.style.setProperty('--lab-width', `${String(width)}px`);
  repaginateEditor(lab);
}

function render(): void {
  const measure = document.querySelector('.lab-measure');
  const pagesRoot = document.querySelector('.lab-pages');
  const button = document.querySelector<HTMLButtonElement>('.lab-narrow');
  if (!measure || !pagesRoot || !button) return;
  const schema = createDocumentSchema();
  const read = readDocumentFile(SAMPLE, schema);
  const measuring = new EditorView(measure, {
    state: EditorState.create({ doc: read }),
    editable: () => false,
  });
  let pending = 0;
  const lab: Lab = {
    measuring,
    editor: new EditorView(pagesRoot, {
      state: EditorState.create({
        doc: projectDocument(read, layOut(measuring, read)),
        plugins: [
          history(),
          keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Shift-Mod-z': redo }),
          keymap(baseKeymap),
        ],
      }),
      dispatchTransaction(tr: Transaction) {
        lab.editor.updateState(lab.editor.state.apply(tr));
        reportCaret(lab.editor);
        if (!tr.docChanged || tr.getMeta(PAGINATION)) return;
        cancelAnimationFrame(pending);
        pending = requestAnimationFrame(() => repaginateEditor(lab));
      },
    }),
  };
  button.addEventListener('click', () => setWidth(lab, button));
  report(lab, read);
  document.documentElement.dataset.labReady = 'true';
}

render();
