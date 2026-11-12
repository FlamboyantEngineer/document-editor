// Shows a sample document on fixed-height pages in an editor kept paginated by `createPagination`:
// its whole document is measured in a hidden view, and the editor moves onto each new layout by
// steps after every edit and when the page width changes, with the caret staying on its text, undo
// undoing edits, and each page leaving room for the footnotes it holds. The page holding the caret
// is read from the layout (`pageMap`).

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
  readDocumentFile,
  sameStructure,
  type StoredNode,
} from '../../src/model/index.js';
import { createPagination, isPaginationTransaction, pageMap } from '../../src/pagination/index.js';

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
const footnote = (id: string, value: string): StoredNode => ({
  type: 'footnote',
  attrs: { id },
  content: [text(value)],
});
const cited = (id: string, before: string, note: StoredNode): StoredNode => ({
  type: 'paragraph',
  attrs: { id },
  content: [text(before), note, text(` ${SENTENCES[1] ?? ''} ${SENTENCES[2] ?? ''}`)],
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
        cited(
          'f1p',
          'Readings were taken with a calibrated meter.',
          footnote(
            'n1',
            'The meter was calibrated the morning of the survey, against the reference.',
          ),
        ),
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
        cited(
          'f2p',
          'Two rooms were measured again a week later.',
          footnote('n2', 'The second visit used the same meter and the same order of rooms.'),
        ),
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

// Whether two whole documents hold the same content, whatever their page and footnote numbers.
function sameContent(left: Node, right: Node): boolean {
  const contents = (doc: Node) => contentPositions(doc).map((pos) => doc.nodeAt(pos));
  const rightContents = contents(right);
  return contents(left).every((content, index) => {
    const other = rightContents[index];
    return Boolean(content && other && sameStructure(content, other));
  });
}

/** The pages wide and narrow, in pixels. */
const WIDTHS = { wide: 480, narrow: 300 } as const;

// Records the caret's text, and the page that holds it as the layout tells it.
function reportCaret({ state }: EditorView): void {
  const { from } = state.selection;
  const { dataset } = document.documentElement;
  dataset.labCaretText = state.doc.textBetween(from, from + 12);
  const layout = pageMap(state);
  const canonical = layout.toCanonical(from);
  dataset.labCaretPage = String(canonical === null ? 0 : (layout.pageAt(canonical)?.number ?? 0));
}

// Records what a test reads after the editor moved onto new pages: whether they join back into
// the content they were laid out from, and how many there are.
function reportPages(tr: Transaction): void {
  const { dataset } = document.documentElement;
  const before = joinDocumentPages(tr.before).doc;
  dataset.labJoinsWhole = String(sameContent(joinDocumentPages(tr.doc).doc, before));
  dataset.labPages = String(document.querySelectorAll('.lab-pages .pm-page').length);
  dataset.labLayouts = String(Number(dataset.labLayouts ?? 0) + 1);
  dataset.labReady = 'true';
}

function render(): void {
  const measureIn = document.querySelector<HTMLElement>('.lab-measure');
  const pagesRoot = document.querySelector('.lab-pages');
  const button = document.querySelector<HTMLButtonElement>('.lab-narrow');
  if (!measureIn || !pagesRoot || !button) return;
  const pagination = createPagination({ measureIn, pageHeight: PAGE_HEIGHT });
  const editor: EditorView = new EditorView(pagesRoot, {
    state: EditorState.create({
      doc: readDocumentFile(SAMPLE, createDocumentSchema()),
      plugins: [
        pagination.plugin,
        history(),
        keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Shift-Mod-z': redo }),
        keymap(baseKeymap),
      ],
    }),
    dispatchTransaction(tr: Transaction) {
      editor.updateState(editor.state.apply(tr));
      reportCaret(editor);
      if (isPaginationTransaction(tr)) reportPages(tr);
    },
  });
  button.addEventListener('click', () => {
    const narrow = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(narrow));
    const width = narrow ? WIDTHS.narrow : WIDTHS.wide;
    document.documentElement.style.setProperty('--lab-width', `${String(width)}px`);
    pagination.refresh({ remeasure: true });
  });
}

render();
