// Shows a paged document edited with the keyboard through `createDocumentEditing`: the document's
// keys format text, make headings and lists, start a new page and join text across a page break,
// the undo history follows the edits through the repaginations, and every new block gets an id.

import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { assignElementIds, createDocumentEditing } from '../../src/engine/index.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  createDocumentSchema,
  type DocumentFile,
  readDocumentFile,
  resolveTemplateFile,
} from '../../src/model/index.js';
import { createPagination, isPaginationTransaction } from '../../src/pagination/index.js';
import { applyTemplate, bodyHeight, heading, list, paragraph } from './lab-document.js';

const TEMPLATE = resolveTemplateFile(BASE_TEMPLATE, {
  loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
  baseTemplateId: BASE_TEMPLATE_ID,
});

// Chapters of long paragraphs, so some continue on the next page.
const CHAPTERS = ['Scope', 'Interfaces', 'Timing'];
const SAMPLE: DocumentFile = {
  formatVersion: 1,
  sections: [
    {
      name: null,
      content: CHAPTERS.flatMap((name) => [
        heading(1, name),
        paragraph(5),
        heading(2, `${name} conditions`),
        paragraph(9),
        list('bulletList', ['Normal operation', 'Degraded operation', 'Maintenance']),
        paragraph(9),
        heading(2, `${name} responses`),
        paragraph(9),
        paragraph(9),
      ]),
    },
  ],
};

// The id of the block holding the caret.
function caretBlockId({ selection }: EditorState): string {
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const id: unknown = $from.node(depth).attrs.dataId;
    if (typeof id === 'string' && id) return id;
  }
  return 'none';
}

function render(): void {
  const measureIn = document.querySelector<HTMLElement>('.de-document-editor__measure');
  const pagesRoot = document.querySelector('.lab-pages');
  const blockId = document.querySelector<HTMLOutputElement>('output[name="block-id"]');
  if (!measureIn || !pagesRoot || !blockId) return;
  applyTemplate(TEMPLATE, []);
  const pagination = createPagination({ measureIn, pageHeight: () => bodyHeight(TEMPLATE) });
  const schema = createDocumentSchema();
  const loaded = EditorState.create({
    doc: readDocumentFile(SAMPLE, schema),
    plugins: [
      pagination.plugin,
      ...createDocumentEditing(schema, { template: () => TEMPLATE, author: () => 'lab' }),
    ],
  });
  // The sample is written without ids, as a stored document from elsewhere may be.
  const identified = loaded.tr;
  assignElementIds(identified, {});
  const editor: EditorView = new EditorView(pagesRoot, {
    state: loaded.apply(identified),
    dispatchTransaction(tr) {
      editor.updateState(editor.state.apply(tr));
      blockId.value = caretBlockId(editor.state);
      const { dataset } = document.documentElement;
      dataset.labPages = String(pagesRoot.querySelectorAll('.pm-page').length);
      if (isPaginationTransaction(tr)) dataset.labReady = 'true';
    },
  });
}

render();
