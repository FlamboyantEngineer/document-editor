// Shows a paged document edited with the keyboard through `createDocumentEditing`: the document's
// keys format text, make headings and lists, start a new page and join text across a page break,
// the undo history follows the edits through the layouts, and every new block gets an id. The
// whole document is the editing state; its pages are a read-only projection of it.

import { EditorState } from 'prosemirror-state';
import { assignElementIds, createDocumentEditing } from '../../src/engine/index.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  createDocumentSchema,
  type DocumentFile,
  readDocumentFile,
  resolveTemplateFile,
} from '../../src/model/index.js';
import { applyTemplate, bodyHeight, heading, list, paragraph } from './lab-document.js';
import { labMounts, showOnPages } from './lab-pages.js';

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
  const mounts = labMounts();
  const blockId = document.querySelector<HTMLOutputElement>('output[name="block-id"]');
  if (!mounts || !blockId) return;
  applyTemplate(TEMPLATE, []);
  const schema = createDocumentSchema();
  const loaded = EditorState.create({
    doc: readDocumentFile(SAMPLE, schema).doc,
    plugins: createDocumentEditing(schema, { template: () => TEMPLATE, author: () => 'lab' }),
  });
  // The sample is written without ids, as a stored document from elsewhere may be.
  const identified = loaded.tr;
  assignElementIds(identified, {});
  const pages = showOnPages(mounts, {
    state: loaded.apply(identified),
    pageHeight: () => bodyHeight(TEMPLATE),
    dispatch: () => {
      blockId.value = caretBlockId(pages.state);
    },
  });
}

render();
