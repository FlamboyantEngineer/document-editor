// A document that shows what a template looks like: its title, every heading level with text, a
// footnote, lists, a table, a code block and an equation, each custom style, then each of the
// template's sections with the content it starts with. It is for viewing a template and is never
// stored.

import type { DocumentFile, StoredNode } from '../format/document-format.js';
import type { TemplateFile, TemplateSection } from '../format/template-format.js';

/** The text a preview document is written in. */
export interface TemplatePreviewText {
  /** The title, when the template has no name. */
  readonly title: string;
  readonly heading: (level: number) => string;
  readonly sentence: string;
  readonly footnote: string;
  readonly items: readonly [string, string, string];
  readonly table: string;
  readonly tableHeader: readonly [string, string];
  readonly code: string;
  readonly codeCaption: string;
  readonly equation: string;
  readonly customStyle: (name: string) => string;
}

/** The English text of a preview document. */
export const DEFAULT_TEMPLATE_PREVIEW_TEXT: TemplatePreviewText = {
  title: 'Template preview',
  heading: (level) => `Heading ${String(level)}`,
  sentence:
    'Each requirement names the condition it applies under and the response it expects, so a test can show it is met.',
  footnote: 'A footnote, numbered as the template numbers them.',
  items: ['First item', 'Second item', 'Third item'],
  table: 'A table',
  tableHeader: ['Condition', 'Limit'],
  code: 'function check(limit) {\n  return limit > 0;\n}',
  codeCaption: 'A code block',
  equation: 'E = mc^2',
  customStyle: (name) => `Text in the ${name} style.`,
};

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const paragraph = (...content: StoredNode[]): StoredNode => ({ type: 'paragraph', content });
const heading = (level: number, value: string, title = false): StoredNode => ({
  type: 'heading',
  attrs: title ? { level, title: true } : { level },
  content: [text(value)],
});
const list = (type: 'bulletList' | 'orderedList', items: readonly string[]): StoredNode => ({
  type,
  content: items.map((item) => ({ type: 'listItem', content: [paragraph(text(item))] })),
});
const cell = (type: 'tableCell' | 'tableHeader', value: string): StoredNode => ({
  type,
  content: [paragraph(text(value))],
});

// The objects a template styles: lists, a table, a code block and an equation, each captioned.
function objects(words: TemplatePreviewText): StoredNode[] {
  const [condition, limit] = words.tableHeader;
  return [
    list('bulletList', words.items),
    list('orderedList', words.items),
    {
      type: 'table',
      attrs: { caption: words.table, captionEnabled: true },
      content: [
        { type: 'tableRow', content: [cell('tableHeader', condition), cell('tableHeader', limit)] },
        ...['10 ms', '20 ms'].map((value, index) => ({
          type: 'tableRow',
          content: [cell('tableCell', words.items[index] ?? ''), cell('tableCell', value)],
        })),
      ],
    },
    {
      type: 'codeBlock',
      attrs: { language: 'javascript', caption: words.codeCaption, captionEnabled: true },
      content: [text(words.code)],
    },
    { type: 'mathBlock', content: [text(words.equation)] },
  ];
}

// The headings of every level, each with text; the first's text cites a footnote.
function headings(words: TemplatePreviewText): StoredNode[] {
  return [1, 2, 3, 4, 5, 6].flatMap((level) => [
    heading(level, words.heading(level)),
    level === 1
      ? paragraph(text(`${words.sentence} `), {
          type: 'footnote',
          attrs: { id: 'preview-note' },
          content: [text(words.footnote)],
        })
      : paragraph(text(words.sentence)),
    ...(level === 1 ? objects(words) : []),
  ]);
}

// A template section with the content it starts with, or its placeholder, or its label.
function section(scope: TemplateSection, words: TemplatePreviewText) {
  const content = scope.content?.length
    ? scope.content
    : scope.placeholder?.length
      ? scope.placeholder
      : [heading(1, scope.label ?? scope.name), paragraph(text(words.sentence))];
  return { name: scope.name, content: structuredClone(content) };
}

/**
 * A document showing every style a template sets, for viewing the template beside its settings:
 * its title, headings, text, footnotes, lists, table, code, equation and custom styles, then each
 * of its sections. The template is resolved, so its sections and custom styles are all there.
 */
export function templatePreviewDocument(
  template: TemplateFile,
  words: TemplatePreviewText = DEFAULT_TEMPLATE_PREVIEW_TEXT,
): DocumentFile {
  const custom = Object.keys(template.styles?.custom ?? {});
  const main: StoredNode[] = [
    heading(1, template.name ?? words.title, true),
    { type: 'contents', attrs: { kind: 'toc', depth: 3 } },
    ...headings(words),
    ...custom.map((name) => ({
      type: 'paragraph',
      attrs: { style: name },
      content: [text(words.customStyle(name))],
    })),
  ];
  return {
    formatVersion: 1,
    template: template.id,
    sections: [
      { name: null, content: main },
      ...(template.sections ?? []).map((scope) => section(scope, words)),
    ],
  };
}
