// Shows lists of contents: a table of contents and a table of tables, drawn live from the document
// (`createContents`), numbered as the stylesheet numbers the headings and tables, with the page
// each entry is on. The table of contents is long enough to continue on the next page. Inserting
// a chapter renumbers every entry after it; an entry takes the reader to what it names.

import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { createContents } from '../../src/engine/index.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  createDocumentSchema,
  readDocumentFile,
  readStoredContent,
  resolveTemplateFile,
  type StoredNode,
} from '../../src/model/index.js';
import { createPagination, isPaginationTransaction } from '../../src/pagination/index.js';
import { applyTemplate, bodyHeight, sampleDocument, text } from './lab-document.js';

const TEMPLATE = resolveTemplateFile(BASE_TEMPLATE, {
  loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
  baseTemplateId: BASE_TEMPLATE_ID,
});

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

function sample() {
  const document = sampleDocument(CHAPTERS);
  const [section] = document.sections;
  if (section) section.content.unshift(contentsBlock('toc', 2), contentsBlock('tables'));
  return document;
}

function render(): void {
  const measureIn = document.querySelector<HTMLElement>('.de-document-editor__measure');
  const pagesRoot = document.querySelector('.lab-pages');
  const insert = document.querySelector<HTMLButtonElement>('button[name="insert-chapter"]');
  if (!measureIn || !pagesRoot || !insert) return;
  applyTemplate(TEMPLATE, []);
  const contents = createContents({ template: () => TEMPLATE });
  const pagination = createPagination({
    measureIn,
    pageHeight: () => bodyHeight(TEMPLATE),
    plugins: [contents],
  });
  const schema = createDocumentSchema();
  const editor: EditorView = new EditorView(pagesRoot, {
    state: EditorState.create({
      doc: readDocumentFile(sample(), schema),
      plugins: [pagination.plugin, contents],
    }),
    dispatchTransaction(tr) {
      editor.updateState(editor.state.apply(tr));
      const { dataset } = document.documentElement;
      dataset.labPages = String(pagesRoot.querySelectorAll('.pm-page').length);
      if (isPaginationTransaction(tr)) dataset.labReady = 'true';
    },
  });
  let added = 0;
  insert.addEventListener('click', () => {
    added += 1;
    // After the lists of contents, at the start of the first chapter.
    let at = -1;
    editor.state.doc.descendants((node, pos) => {
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
    if (at >= 0) editor.dispatch(editor.state.tr.insert(at, blocks));
  });
}

render();
