// Shows a document styled by a template: the template's custom properties (`templateProperties`)
// set on the page, a stylesheet that reads them, and pages sized by the template's page metrics.
// Choosing another template sets its properties and lays the pages out again.

import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  createDocumentSchema,
  readDocumentFile,
  resolveTemplateFile,
  type TemplateFile,
} from '../../src/model/index.js';
import { createPagination, isPaginationTransaction } from '../../src/pagination/index.js';
import { applyTemplate, bodyHeight, sampleDocument } from './lab-document.js';

const COMPACT: TemplateFile = {
  formatVersion: 1,
  id: 'compact',
  name: 'Compact',
  page: {
    size: 'US Letter',
    orientation: 'landscape',
    margins: { top: '0.5in', right: '0.75in', bottom: '0.5in', left: '0.75in' },
  },
  styles: {
    paragraph: { font: 'Georgia', size: '11px', lineHeight: 1.3, color: '#1e293b' },
    heading1: { font: 'Georgia', size: '18px', color: '#7c2d12', numbering: { format: 'A.' } },
    heading2: { font: 'Georgia', size: '15px', color: '#9a3412', numbering: { format: 'A.1.' } },
    list: { bullet: 'square', format: 'a)' },
    table: { header: { background: '#fed7aa', color: '#431407' } },
  },
};

/** The templates a reader can choose, resolved over the base template. */
const TEMPLATES: Readonly<Record<string, TemplateFile>> = Object.fromEntries(
  [BASE_TEMPLATE, COMPACT].map((template) => [
    template.id,
    resolveTemplateFile(template, {
      loadTemplate: (id) => (id === BASE_TEMPLATE_ID ? BASE_TEMPLATE : null),
      baseTemplateId: BASE_TEMPLATE_ID,
    }),
  ]),
);

const SAMPLE = sampleDocument(['Scope', 'Interfaces', 'Timing']);

function render(): void {
  const measureIn = document.querySelector<HTMLElement>('.de-document-editor__measure');
  const pagesRoot = document.querySelector('.lab-pages');
  const choices = document.querySelectorAll<HTMLInputElement>('input[name="template"]');
  if (!measureIn || !pagesRoot) return;
  let current = TEMPLATES[BASE_TEMPLATE_ID] ?? BASE_TEMPLATE;
  let applied = applyTemplate(current, []);
  const pagination = createPagination({ measureIn, pageHeight: () => bodyHeight(current) });
  const editor: EditorView = new EditorView(pagesRoot, {
    state: EditorState.create({
      doc: readDocumentFile(SAMPLE, createDocumentSchema()),
      plugins: [pagination.plugin],
    }),
    dispatchTransaction(tr) {
      editor.updateState(editor.state.apply(tr));
      if (!isPaginationTransaction(tr)) return;
      const { dataset } = document.documentElement;
      dataset.labPages = String(pagesRoot.querySelectorAll('.pm-page').length);
      dataset.labLaidOut = current.id;
      dataset.labReady = 'true';
    },
  });
  choices.forEach((choice) =>
    choice.addEventListener('change', () => {
      current = TEMPLATES[choice.value] ?? current;
      applied = applyTemplate(current, applied);
      pagination.refresh({ remeasure: true });
    }),
  );
}

render();
