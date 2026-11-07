// What the template labs share: a sample document of chapters, a template's properties set on the
// page, and the height inside a template's page margins.

import {
  type DocumentFile,
  type StoredNode,
  type TemplateFile,
  templatePageMetrics,
  templateProperties,
} from '../../src/model/index.js';

const SENTENCE =
  'Each requirement names the condition it applies under and the response it expects, so a test can show it is met.';

export const text = (value: string): StoredNode => ({ type: 'text', text: value });
export const variable = (key: string): StoredNode => ({ type: 'variable', attrs: { key } });
export const paragraph = (sentences: number): StoredNode => ({
  type: 'paragraph',
  content: [text(Array.from({ length: sentences }, () => SENTENCE).join(' '))],
});
export const heading = (level: number, value: string): StoredNode => ({
  type: 'heading',
  attrs: { level },
  content: [text(value)],
});
const cell = (type: 'tableCell' | 'tableHeader', value: string): StoredNode => ({
  type,
  content: [{ type: 'paragraph', content: [text(value)] }],
});
export const list = (type: 'bulletList' | 'orderedList', items: string[]): StoredNode => ({
  type,
  content: items.map((value) => ({
    type: 'listItem',
    content: [{ type: 'paragraph', content: [text(value)] }],
  })),
});

/** A chapter: a heading, text, lists and a table. */
export function chapter(name: string): StoredNode[] {
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
      attrs: { caption: `${name} limits` },
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

/** A one-section document with a chapter of headings, text, lists and a table for each name. */
export function sampleDocument(chapters: readonly string[]): DocumentFile {
  return { formatVersion: 1, sections: [{ name: null, content: chapters.flatMap(chapter) }] };
}

/** The height inside a template's page margins. */
export function bodyHeight(template: TemplateFile): number {
  const { height, margins } = templatePageMetrics(template);
  return height - margins.top - margins.bottom;
}

/** Sets a template's properties on the page, replacing the ones set before, and returns their names. */
export function applyTemplate(template: TemplateFile, previous: readonly string[]): string[] {
  const { style } = document.documentElement;
  for (const name of previous) style.removeProperty(name);
  const properties = templateProperties(template);
  for (const [name, value] of Object.entries(properties)) style.setProperty(name, value);
  document.documentElement.dataset.labTemplate = template.id;
  return Object.keys(properties);
}
