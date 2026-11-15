import { EditorState } from 'prosemirror-state';
import { assignElementIds, createDocumentEditing } from '../../../src/engine/index.js';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  createDocumentSchema,
  type DocumentFile,
  readDocumentFile,
  resolveTemplateFile,
} from '../../../src/model/index.js';
import { heading, paragraph, sampleDocument, text } from '../lab-document.js';

export const canvasSamples = [
  { id: 'mixed', label: 'Mixed content' },
  { id: 'long', label: 'Long plain paragraphs' },
  { id: 'rich', label: 'Formatted and international text' },
  { id: 'many', label: 'Many pages' },
] as const;

export type CanvasSample = (typeof canvasSamples)[number]['id'];

export const canvasTemplate = resolveTemplateFile(BASE_TEMPLATE, {
  loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
  baseTemplateId: BASE_TEMPLATE_ID,
});

function documentOf(sample: CanvasSample): DocumentFile {
  if (sample === 'mixed') return sampleDocument(['Canvas editing', 'Tables and lists']);
  if (sample === 'many')
    return sampleDocument(Array.from({ length: 30 }, (_, index) => `Chapter ${String(index + 1)}`));
  const content =
    sample === 'long'
      ? [heading(1, 'Long plain paragraphs'), paragraph(420), paragraph(160)]
      : [
          heading(1, 'Formatted and international text'),
          ...Array.from({ length: 35 }, () => ({
            type: 'paragraph',
            content: [
              text('Ordinary text, '),
              { ...text('bold text'), marks: [{ type: 'strong' }] },
              text(', '),
              { ...text('italic text'), marks: [{ type: 'em' }] },
              text('. Accents: café, résumé. Ελληνικά. 日本語. العربية. '.repeat(5)),
            ],
          })),
        ];
  return { formatVersion: 1, sections: [{ name: null, content }] };
}

/** Builds a fresh sample; switching rendering keeps the existing state instead. */
export function createCanvasState(sample: CanvasSample): EditorState {
  const schema = createDocumentSchema();
  const state = EditorState.create({
    doc: readDocumentFile(documentOf(sample), schema).doc,
    plugins: createDocumentEditing(schema, { template: () => canvasTemplate, author: () => 'lab' }),
  });
  const tr = state.tr;
  assignElementIds(tr, {});
  return state.apply(tr.setMeta('addToHistory', false));
}
