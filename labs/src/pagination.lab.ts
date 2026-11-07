// Measures a sample document in a hidden editor view, lays its section out on fixed-height pages
// and renders each page's blocks, so a browser test can check where the pages break.

import { DOMSerializer, Fragment, type Node } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import {
  createDocumentSchema,
  type DocumentFile,
  joinFragments,
  layoutPages,
  readDocumentFile,
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

function pageContentPos(doc: Node): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.type.name === 'page_content') found = pos;
    return found < 0;
  });
  return found;
}

function render(): void {
  const measure = document.querySelector('.lab-measure');
  const pagesRoot = document.querySelector('.lab-pages');
  if (!measure || !pagesRoot) return;
  const schema = createDocumentSchema();
  const doc = readDocumentFile(SAMPLE, schema);
  const view = new EditorView(measure, {
    state: EditorState.create({ doc }),
    editable: () => false,
  });
  const content = doc.nodeAt(pageContentPos(doc));
  const blocks = measureChildBlocks(view, pageContentPos(doc));
  const pages = layoutPages(blocks, { pageHeight: PAGE_HEIGHT });
  const serializer = DOMSerializer.fromSchema(schema);
  pages.forEach((page, index) => {
    const pageElement = document.createElement('section');
    pageElement.className = 'lab-page';
    pageElement.setAttribute('aria-label', `Page ${String(index + 1)}`);
    const contentElement = document.createElement('div');
    contentElement.className = 'lab-page-content';
    contentElement.style.height = `${String(PAGE_HEIGHT)}px`;
    contentElement.append(
      serializer.serializeFragment(Fragment.from(page.map((block) => block.node))),
    );
    pageElement.append(contentElement);
    pagesRoot.append(pageElement);
  });
  const joined = joinFragments(pages.flat().map((block) => block.node));
  const whole = content
    ? joined.length === content.childCount &&
      joined.every((node, index) => node.eq(content.child(index)))
    : false;
  document.documentElement.dataset.labJoinsWhole = String(whole);
  view.destroy();
  document.documentElement.dataset.labReady = 'true';
}

render();
