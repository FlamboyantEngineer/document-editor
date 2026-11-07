// Shows a document styled by a template: the template's custom properties (`templateProperties`)
// set on the page, a stylesheet that reads them, and pages sized by the template's page metrics.
// Choosing another template sets its properties and lays the pages out again.

import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import {
  BASE_TEMPLATE,
  BASE_TEMPLATE_ID,
  createDocumentSchema,
  type DocumentFile,
  readDocumentFile,
  resolveTemplateFile,
  type StoredNode,
  type TemplateFile,
  templatePageMetrics,
  templateProperties,
} from '../../src/model/index.js';
import { createPagination, isPaginationTransaction } from '../../src/pagination/index.js';

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

const SENTENCE =
  'Each requirement names the condition it applies under and the response it expects, so a test can show it is met.';

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const paragraph = (sentences: number): StoredNode => ({
  type: 'paragraph',
  content: [text(Array.from({ length: sentences }, () => SENTENCE).join(' '))],
});
const heading = (level: number, value: string): StoredNode => ({
  type: 'heading',
  attrs: { level },
  content: [text(value)],
});
const cell = (type: 'tableCell' | 'tableHeader', value: string): StoredNode => ({
  type,
  content: [{ type: 'paragraph', content: [text(value)] }],
});
const list = (type: 'bulletList' | 'orderedList', items: string[]): StoredNode => ({
  type,
  content: items.map((value) => ({
    type: 'listItem',
    content: [{ type: 'paragraph', content: [text(value)] }],
  })),
});

function chapter(name: string): StoredNode[] {
  return [
    heading(1, name),
    paragraph(4),
    heading(2, `${name} conditions`),
    paragraph(6),
    list('bulletList', ['Normal operation', 'Degraded operation', 'Maintenance']),
    heading(2, `${name} responses`),
    paragraph(5),
    list('orderedList', ['Detect the condition', 'Report it', 'Recover']),
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [cell('tableHeader', 'Condition'), cell('tableHeader', 'Limit')],
        },
        ...['Start', 'Run', 'Stop'].map((value, index) => ({
          type: 'tableRow',
          content: [cell('tableCell', value), cell('tableCell', `${String((index + 1) * 25)} ms`)],
        })),
      ],
    },
    paragraph(3),
  ];
}

const SAMPLE: DocumentFile = {
  formatVersion: 1,
  sections: [{ name: null, content: ['Scope', 'Interfaces', 'Timing'].flatMap(chapter) }],
};

function contentHeight(template: TemplateFile): number {
  const { height, margins } = templatePageMetrics(template);
  return height - margins.top - margins.bottom;
}

// Sets a template's properties on the document, replacing the last template's.
function applyTemplate(template: TemplateFile, previous: readonly string[]): string[] {
  const { style } = document.documentElement;
  for (const name of previous) style.removeProperty(name);
  const properties = templateProperties(template);
  for (const [name, value] of Object.entries(properties)) style.setProperty(name, value);
  document.documentElement.dataset.labTemplate = template.id;
  return Object.keys(properties);
}

function render(): void {
  const measureIn = document.querySelector<HTMLElement>('.de-measure');
  const pagesRoot = document.querySelector('.lab-pages');
  const choices = document.querySelectorAll<HTMLInputElement>('input[name="template"]');
  if (!measureIn || !pagesRoot) return;
  let current = TEMPLATES[BASE_TEMPLATE_ID] ?? BASE_TEMPLATE;
  let applied = applyTemplate(current, []);
  const pagination = createPagination({ measureIn, pageHeight: () => contentHeight(current) });
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
