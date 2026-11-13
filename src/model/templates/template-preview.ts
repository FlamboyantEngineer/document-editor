// A document that shows what a template looks like: its title, every heading level with text, a
// footnote, lists, a table, a code block and an equation, each custom style, then each of the
// template's sections with the content it starts with. It is for viewing a template and is never
// stored. Shown in parts, each template section is two sections, its starting content and its
// placeholder, which a template editor edits in place and writes back into the template.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { DocumentFile, StoredContent, StoredNode } from '../format/document-format.js';
import type { TemplateFile, TemplateSection } from '../format/template-format.js';
import {
  type DocumentRegion,
  type DocumentSection,
  documentSections,
  sectionRegions,
} from '../schema/document-structure.js';

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

/** What a section of a preview shown in parts holds of its template section. */
export type TemplatePart = 'content' | 'placeholder';

/** How a preview document is made. */
export interface TemplatePreviewOptions {
  /**
   * Shows each template section as two sections of its name, its starting content and then its
   * placeholder, each an empty paragraph while the template has none, to edit them in place.
   */
  readonly parts?: boolean | undefined;
}

/** A section of a preview shown in parts: its template section's content or placeholder. */
export interface TemplatePartSection {
  readonly section: DocumentSection & { readonly name: string };
  readonly part: TemplatePart;
  /** The section's content region, which holds the part. */
  readonly content: DocumentRegion;
}

/** A part of a template section edited in place, with its new content. */
export interface TemplatePartChange {
  readonly section: string;
  readonly part: TemplatePart;
  readonly content: StoredContent;
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
const paragraph = (...content: StoredNode[]): StoredNode =>
  content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
const heading = (level: number, value: string, title = false): StoredNode => ({
  type: 'heading',
  attrs: title ? { level, title: true } : { level },
  content: [text(value)],
});
const list = (type: 'bulletList' | 'orderedList', items: readonly string[]): StoredNode => ({
  type,
  content: items.map((item) => ({ type: 'listItem', content: [paragraph(text(item))] })),
});
const CONTENT = new Set(['content'] as const);

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

// A template section's starting content and placeholder, each an empty paragraph when it has none.
const parts = (scope: TemplateSection) =>
  [scope.content, scope.placeholder].map((content) => ({
    name: scope.name,
    content: content?.length ? structuredClone(content) : [paragraph()],
  }));

/**
 * A document showing every style a template sets, for viewing the template beside its settings:
 * its title, headings, text, footnotes, lists, table, code, equation and custom styles, then each
 * of its sections, or with `parts`, each one's content and placeholder. The template is resolved,
 * so its sections and custom styles are all there.
 */
export function templatePreviewDocument(
  template: TemplateFile,
  words: TemplatePreviewText = DEFAULT_TEMPLATE_PREVIEW_TEXT,
  options: TemplatePreviewOptions = {},
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
    template: { id: template.id },
    sections: [
      { name: null, content: main },
      ...(template.sections ?? []).flatMap((scope) =>
        options.parts ? parts(scope) : [section(scope, words)],
      ),
    ],
  };
}

/**
 * The sections of a preview shown in parts: of each template section's name, the first holds its
 * starting content and the second its placeholder.
 */
export function templatePartSections(doc: ProseMirrorNode): TemplatePartSection[] {
  const seen = new Map<string, number>();
  const found: TemplatePartSection[] = [];
  for (const section of documentSections(doc)) {
    const { name } = section;
    const content = sectionRegions(section, CONTENT)[0];
    if (name === null || !content) continue;
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    const part = (['content', 'placeholder'] as const)[count];
    if (part) found.push({ section: { ...section, name }, part, content });
  }
  return found;
}

// Whether content is nothing but one empty paragraph.
const isEmpty = (content: StoredContent) =>
  content.length === 0 ||
  (content.length === 1 && content[0]?.type === 'paragraph' && !content[0].content?.length);

/**
 * A template with a part of a section edited in place written into it: the section's starting
 * content or placeholder, left out when it is one empty paragraph. A template inheriting its
 * sections takes the resolved ones as its own first, since a list of sections replaces its parent's.
 */
export function withTemplatePart(
  template: TemplateFile,
  change: TemplatePartChange,
  resolved: TemplateFile = template,
): TemplateFile {
  const sections = template.sections ?? resolved.sections ?? [];
  if (!sections.some((section) => section.name === change.section)) return template;
  return {
    ...template,
    sections: sections.map((section) => {
      if (section.name !== change.section) return section;
      const { [change.part]: _replaced, ...rest } = section;
      return isEmpty(change.content) ? rest : { ...rest, [change.part]: change.content };
    }),
  };
}
