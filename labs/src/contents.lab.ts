// Shows lists of contents: a table of contents and a table of tables, drawn live from the document
// (`createContents`), numbered as the stylesheet numbers the headings and tables, with the page
// each entry is on, and a list of quotations, a kind of list the lab configures for a node type
// the defaults do not list. The table of contents is long enough to continue on the next page, its
// levels nest down to level 6, each level in the type the template gives it, and a long entry wraps.
// Inserting a chapter renumbers every entry after it; an entry takes the reader to what it names.

import { EditorState } from 'prosemirror-state';
import { createContents } from '../../src/engine/index.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  type ContentsKind,
  createDocumentSchema,
  readDocumentFile,
  readStoredContent,
  resolveTemplateFile,
  type StoredNode,
} from '../../src/model/index.js';
import { applyTemplate, bodyHeight, sampleDocument, text } from './lab-document.js';
import { labMounts, showOnPages } from './lab-pages.js';

// The base template, with a table of contents whose first level is larger and bold and whose
// second is italic, and a list of tables with a dashed leader.
const TEMPLATE = resolveTemplateFile(
  {
    formatVersion: 1,
    id: 'contents-lab',
    parent: BASE_TEMPLATE_ID,
    styles: {
      contents: {
        kinds: {
          toc: { levels: [{ size: '13pt', weight: 700 }, { italic: true }] },
          tables: { leader: { character: '-' } },
        },
      },
    },
  },
  {
    loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
    baseTemplateId: BASE_TEMPLATE_ID,
  },
);

// Headings down to level 6 under the last chapter, and one too long for a row, which wraps.
const DEEP: StoredNode[] = [
  {
    type: 'heading',
    attrs: { level: 2 },
    content: [
      text(
        'Archive retention of every record, report, log, release note, review minute, audit finding and change request kept after the hand-over, with who may read each one and for how long',
      ),
    ],
  },
  ...[3, 4, 5, 6].map((level): StoredNode => ({
    type: 'heading',
    attrs: { level },
    content: [text(`Archive level ${String(level)}`)],
  })),
];

const CHAPTERS = [
  'Scope',
  'Interfaces',
  'Timing',
  'Power',
  'Storage',
  'Startup',
  'Shutdown',
  'Monitoring',
  'Recovery',
  'Logging',
  'Security',
  'Maintenance',
  'Testing',
  'Delivery',
  'Support',
  'Retirement',
  'Training',
  'Records',
  'Reviews',
  'Audits',
  'Changes',
  'Releases',
  'Hand-over',
  'Archive',
];

const contentsBlock = (kind: string, depth = 6): StoredNode => ({
  type: 'contents',
  attrs: { kind, depth },
});

const quotation = (value: string): StoredNode => ({
  type: 'blockquote',
  content: [{ type: 'paragraph', content: [text(value)] }],
});

// A list of quotations: a kind of list the defaults do not have, numbered by the lab.
// The quotations, latest chapter first, without page numbers or leaders.
const QUOTES: ContentsKind = {
  nodes: ['blockquote'],
  number: (node) => `“${node.textContent.slice(0, 1)}”`,
  sort: (a, b) => b.text.localeCompare(a.text),
  showPage: false,
  leader: false,
};

function sample() {
  const document = sampleDocument(CHAPTERS);
  const [section] = document.sections;
  if (!section) return document;
  let chapter = 0;
  section.content = section.content.flatMap((block) => {
    if (block.type !== 'heading' || block.attrs?.level !== 1) return [block];
    chapter += 1;
    return chapter % 8 === 1
      ? [block, quotation(`Quoted in chapter ${String(chapter)}.`)]
      : [block];
  });
  section.content.push(...DEEP);
  section.content.unshift(contentsBlock('toc'), contentsBlock('tables'));
  section.content.push(contentsBlock('quotes'));
  return document;
}

function render(): void {
  const mounts = labMounts();
  const insert = document.querySelector<HTMLButtonElement>('button[name="insert-chapter"]');
  if (!mounts || !insert) return;
  applyTemplate(TEMPLATE, []);
  const contents = createContents({
    template: () => TEMPLATE,
    kinds: { quotes: QUOTES },
    labels: { quotes: { title: 'Table of Quotations', empty: 'No quotations found.' } },
  });
  const schema = createDocumentSchema();
  const pages = showOnPages(mounts, {
    state: EditorState.create({ doc: readDocumentFile(sample(), schema).doc, plugins: [contents] }),
    pageHeight: () => bodyHeight(TEMPLATE),
  });
  let added = 0;
  insert.addEventListener('click', () => {
    added += 1;
    // After the lists of contents, at the start of the first chapter.
    const { state } = pages;
    let at = -1;
    state.doc.descendants((node, pos) => {
      if (at < 0 && node.type.name === 'heading') at = pos;
      return at < 0;
    });
    const blocks = readStoredContent(
      [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [text(`Inserted chapter ${String(added)}`)],
        },
        { type: 'paragraph', content: [text('A chapter added before the others.')] },
      ],
      schema,
    );
    if (at >= 0) pages.dispatch(state.tr.insert(at, blocks));
  });
}

render();
