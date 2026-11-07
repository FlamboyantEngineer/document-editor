// Shows a document in the web layout, as an article: no pages, the content inset only by a root
// template's pixel margins, a title and byline above it, and the content kept in layout sections
// that the controls arrange. Reading shows the columns without their boxes; Authoring edits them.

import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import {
  activeLayoutPreset,
  createLayoutSections,
  insertLayoutSectionBelow,
  moveLayoutSection,
  removeLayoutSection,
  setLayoutPreset,
} from '../../src/engine/index.js';
import {
  countWords,
  createDocumentSchema,
  readDocumentFile,
  readingMinutes,
  resolveTemplateFile,
  type StoredNode,
  type TemplateFile,
} from '../../src/model/index.js';
import { applyTemplate, text } from './lab-document.js';

// A root template: it inherits nothing from the base template, so its headings are not numbered.
const ARTICLE = resolveTemplateFile(
  {
    formatVersion: 1,
    id: 'article',
    page: {
      size: 'A4',
      margins: { top: '24px', right: '24px', bottom: '24px', left: '24px' },
    },
    styles: {
      title: { font: 'Arial', size: '28px', weight: 700, color: '#111827' },
      paragraph: { font: 'Arial', size: '15px', lineHeight: 1.6, spaceAfter: '8px' },
      heading1: { font: 'Arial', size: '22px', weight: 700, spaceBefore: '16px' },
      heading2: { font: 'Arial', size: '18px', weight: 700, spaceBefore: '12px' },
    },
  } satisfies TemplateFile,
  { loadTemplate: () => null, baseTemplateId: null },
);

const SENTENCE = 'Short sections in columns let a reader compare the options side by side.';

const paragraph = (sentences: number): StoredNode => ({
  type: 'paragraph',
  content: [text(Array.from({ length: sentences }, () => SENTENCE).join(' '))],
});
const heading = (level: number, value: string): StoredNode => ({
  type: 'heading',
  attrs: { level },
  content: [text(value)],
});
const columns = (preset: string, ...content: StoredNode[][]): StoredNode => ({
  type: 'columns',
  attrs: { preset },
  content: content.map((blocks) => ({ type: 'column', content: blocks })),
});

const SAMPLE: StoredNode[] = [
  columns('single', [heading(1, 'Overview'), paragraph(3)]),
  columns(
    'halves',
    [heading(2, 'Option one'), paragraph(2)],
    [heading(2, 'Option two'), paragraph(2)],
  ),
  columns('third-two-thirds', [heading(2, 'Summary'), paragraph(1)], [paragraph(4)]),
  columns('thirds', [paragraph(1)], [paragraph(1)], [paragraph(1)]),
];

/** The layout controls and the commands they run. */
const CONTROLS = {
  single: setLayoutPreset('single'),
  halves: setLayoutPreset('halves'),
  'third-two-thirds': setLayoutPreset('third-two-thirds'),
  'two-thirds-third': setLayoutPreset('two-thirds-third'),
  thirds: setLayoutPreset('thirds'),
  below: insertLayoutSectionBelow,
  up: moveLayoutSection(-1),
  down: moveLayoutSection(1),
  remove: removeLayoutSection,
} as const;

function render(): void {
  const surface = document.querySelector<HTMLElement>('.de-document');
  const content = document.querySelector('.lab-content');
  const byline = document.querySelector('.lab-byline');
  const mode = document.querySelector<HTMLInputElement>('input[name="authoring"]');
  const buttons = document.querySelectorAll<HTMLButtonElement>('button[data-command]');
  if (!surface || !content || !byline || !mode) return;
  applyTemplate(ARTICLE, []);
  const authoring = () => mode.checked;
  const update = (view: EditorView) => {
    surface.dataset.mode = authoring() ? 'authoring' : 'reading';
    const minutes = readingMinutes(countWords(view.state.doc));
    byline.textContent = `Created by Sam Lee, last updated on 7 November 2026 • ${String(minutes)} minute read`;
    const active = activeLayoutPreset(view.state);
    buttons.forEach((button) => {
      const command = CONTROLS[button.dataset.command as keyof typeof CONTROLS];
      button.disabled = !authoring() || !command(view.state);
      button.setAttribute('aria-pressed', String(button.dataset.command === active));
    });
    document.documentElement.dataset.labPreset = active ?? '';
    document.documentElement.dataset.labReady = 'true';
  };
  const editor: EditorView = new EditorView(content, {
    state: EditorState.create({
      doc: readDocumentFile(
        { formatVersion: 1, sections: [{ name: null, content: SAMPLE }] },
        createDocumentSchema(),
      ),
      plugins: [createLayoutSections({ keepWrapped: true })],
    }),
    editable: authoring,
    dispatchTransaction(tr) {
      editor.updateState(editor.state.apply(tr));
      update(editor);
    },
  });
  buttons.forEach((button) =>
    button.addEventListener('mousedown', (event) => {
      // The editor keeps its selection while a control runs a command on it.
      event.preventDefault();
      const command = CONTROLS[button.dataset.command as keyof typeof CONTROLS];
      command(editor.state, editor.dispatch);
      editor.focus();
    }),
  );
  mode.addEventListener('change', () => {
    editor.setProps({ editable: authoring });
    update(editor);
  });
  update(editor);
}

render();
