// The sample content of a template preview: the title, every heading level with text, footnotes,
// nested lists, a figure, a table and a code block long enough to continue on the next page, an
// equation, each custom style, and a paragraph per kind of change, whose older version shows the
// change bars when the preview is compared with it.

import type { StoredNode } from '../format/document-format.js';
import type { TemplateFile } from '../format/template-format.js';
import { storedCaption } from '../schema/caption-content.js';

/** The text a preview document is written in. */
export interface TemplatePreviewText {
  /** The title, when the template has no name. */
  readonly title: string;
  readonly heading: (level: number) => string;
  readonly sentence: string;
  readonly footnote: string;
  readonly secondFootnote: string;
  readonly items: readonly [string, string, string];
  /** A nested item's text, given its parent's and its place from 1. */
  readonly subItem: (parent: string, index: number) => string;
  readonly table: string;
  readonly tableHeader: readonly [string, string];
  readonly figure: string;
  readonly code: string;
  readonly codeCaption: string;
  readonly equation: string;
  readonly customStyle: (name: string) => string;
  /** The change samples: what was inserted and deleted, a modified text before and after, and text formatted since. */
  readonly changes: {
    readonly inserted: string;
    readonly deleted: string;
    readonly modified: string;
    readonly modifiedBefore: string;
    readonly formatted: string;
  };
}

/** The English text of a preview document. */
export const DEFAULT_TEMPLATE_PREVIEW_TEXT: TemplatePreviewText = {
  title: 'Template preview',
  heading: (level) => `Heading ${String(level)}`,
  sentence:
    'Each requirement names the condition it applies under and the response it expects, so a test can show it is met.',
  footnote: 'A footnote, numbered as the template numbers them.',
  secondFootnote: 'A second footnote.',
  items: ['First item', 'Second item', 'Third item'],
  subItem: (parent, index) => `${parent}, part ${String(index)}`,
  table: 'A table',
  tableHeader: ['Condition', 'Limit'],
  figure: 'A figure',
  code: 'function check(limit) {\n  return limit > 0;\n}',
  codeCaption: 'A code block',
  equation: 'E = mc^2',
  customStyle: (name) => `Text in the ${name} style.`,
  changes: {
    inserted: 'A paragraph inserted since the older version.',
    deleted: 'A paragraph deleted since the older version.',
    modified: 'A paragraph whose text changed since the older version.',
    modifiedBefore: 'A paragraph whose text was this in the older version.',
    formatted: 'A paragraph formatted since the older version.',
  },
};

// Rows and lines enough that the table and the code block continue on the next page.
const CONTINUED = 48;

// A small picture, drawn in place so the preview loads nothing.
const FIGURE_SOURCE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120"><rect width="320" height="120" fill="#e5e7eb"/></svg>',
)}`;

const text = (value: string): StoredNode => ({ type: 'text', text: value });
export const paragraph = (...content: StoredNode[]): StoredNode =>
  content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
export const heading = (level: number, value: string, title = false): StoredNode => ({
  type: 'heading',
  attrs: title ? { level, title: true } : { level },
  content: [text(value)],
});
const item = (value: string, nested?: StoredNode): StoredNode => ({
  type: 'listItem',
  content: nested ? [paragraph(text(value)), nested] : [paragraph(text(value))],
});

// A list of three items, each with two items under it, each with one under that.
function nestedList(type: 'bulletList' | 'orderedList', words: TemplatePreviewText): StoredNode {
  const level = (items: readonly string[], depth: number): StoredNode => ({
    type,
    content: items.map((value) => {
      const count = depth === 0 ? 2 : 1;
      const under = Array.from({ length: count }, (_, index) => words.subItem(value, index + 1));
      return depth < 2 ? item(value, level(under, depth + 1)) : item(value);
    }),
  });
  return level(words.items, 0);
}

const cell = (type: 'tableCell' | 'tableHeader', value: string): StoredNode => ({
  type,
  content: [paragraph(text(value))],
});

// A captioned table whose header row repeats on the page it continues on.
function table(words: TemplatePreviewText): StoredNode {
  const [condition, limit] = words.tableHeader;
  return {
    type: 'table',
    attrs: { captionEnabled: true },
    content: [
      storedCaption(words.table),
      { type: 'tableRow', content: [cell('tableHeader', condition), cell('tableHeader', limit)] },
      ...Array.from({ length: CONTINUED }, (_, index) => ({
        type: 'tableRow',
        content: [
          cell('tableCell', words.items[index % words.items.length] ?? ''),
          cell('tableCell', `${String((index + 1) * 10)} ms`),
        ],
      })),
    ],
  };
}

// The objects a template styles: lists, a figure, a table, a code block and an equation.
function objects(words: TemplatePreviewText): StoredNode[] {
  return [
    nestedList('bulletList', words),
    nestedList('orderedList', words),
    {
      type: 'figure',
      attrs: { src: FIGURE_SOURCE, alt: words.figure, captionEnabled: true },
      content: [storedCaption(words.figure)],
    },
    table(words),
    {
      type: 'codeBlock',
      attrs: { language: 'javascript', captionEnabled: true },
      content: [
        storedCaption(words.codeCaption),
        text(Array.from({ length: CONTINUED / 3 }, () => words.code).join('\n')),
      ],
    },
    { type: 'mathBlock', attrs: { source: words.equation } },
  ];
}

const footnote = (id: string, value: string): StoredNode => ({
  type: 'footnote',
  attrs: { id },
  content: [text(value)],
});

// The headings of every level, each with text; the first two cite a footnote each.
function headings(words: TemplatePreviewText): StoredNode[] {
  const notes = [words.footnote, words.secondFootnote];
  return [1, 2, 3, 4, 5, 6].flatMap((level) => {
    const note = notes[level - 1];
    return [
      heading(level, words.heading(level)),
      note
        ? paragraph(text(`${words.sentence} `), footnote(`preview-note-${String(level)}`, note))
        : paragraph(text(words.sentence)),
      ...(level === 1 ? objects(words) : []),
    ];
  });
}

// The element ids of the change samples, kept by the editor as they are valid ones.
const CHANGE_IDS = {
  inserted: 'c4a0e001',
  modified: 'c4a0e002',
  formatted: 'c4a0e003',
  deleted: 'c4a0e004',
  kept: 'c4a0e005',
} as const;

const sample = (id: string, ...content: StoredNode[]): StoredNode => ({
  ...paragraph(...content),
  attrs: { id },
});

// A paragraph per kind of change, as the newer version holds them, and an unchanged one after them
// that the deleted paragraph stood before, so each change marks a line of its own.
function changes(words: TemplatePreviewText): StoredNode[] {
  const { inserted, modified, formatted } = words.changes;
  return [
    sample(CHANGE_IDS.inserted, text(inserted)),
    sample(CHANGE_IDS.modified, text(modified)),
    sample(CHANGE_IDS.formatted, { ...text(formatted), marks: [{ type: 'bold' }] }),
    sample(CHANGE_IDS.kept, text(words.sentence)),
  ];
}

/**
 * The change samples as the older version held them: without the inserted paragraph, the modified
 * one with its earlier text, the formatted one plain, and the deleted one before the unchanged one.
 */
export function olderChanges(
  content: readonly StoredNode[],
  words: TemplatePreviewText,
): StoredNode[] {
  const { deleted, modifiedBefore, formatted } = words.changes;
  return content.flatMap((node) => {
    const id = node.attrs?.id;
    if (id === CHANGE_IDS.inserted) return [];
    if (id === CHANGE_IDS.modified) return [sample(CHANGE_IDS.modified, text(modifiedBefore))];
    if (id === CHANGE_IDS.formatted) return [sample(CHANGE_IDS.formatted, text(formatted))];
    if (id === CHANGE_IDS.kept) return [sample(CHANGE_IDS.deleted, text(deleted)), node];
    return [node];
  });
}

/** The preview's main section. */
export function previewMain(template: TemplateFile, words: TemplatePreviewText): StoredNode[] {
  const custom = Object.keys(template.styles?.custom ?? {});
  return [
    heading(1, template.name ?? words.title, true),
    { type: 'contents', attrs: { kind: 'toc', depth: 3 } },
    ...headings(words),
    ...custom.map((name) => ({
      type: 'paragraph',
      attrs: { style: name },
      content: [text(words.customStyle(name))],
    })),
    ...changes(words),
  ];
}
