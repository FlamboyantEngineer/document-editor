// @vitest-environment node
// Every document of the regression set, exported to a word processing document and read back with
// the library's reader: the document keeps its sections, its block structure, its headings,
// paragraph levels and styles, and its footnotes. A document with content Word export writes with
// a loss, or that the reader does not yet read back, is listed with the gap: it keeps its sections
// and footnotes, and its blocks must still differ, so a fixed gap fails until it leaves the list.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readDocx } from '../../import/index.js';
import type { DocumentFile, StoredNode } from './document-format.js';
import { writeDocx } from './docx.js';
import { keptContent } from './left-out.js';
import type { TemplateFile } from './template-format.js';
import { resolveTemplateFile } from './template-format-resolve.js';

const root = join(import.meta.dirname, '../../../test/fixtures/documents');
const readJson = <T>(path: string) => JSON.parse(readFileSync(path, 'utf8')) as T;
const templates = new Map(
  readdirSync(join(root, 'templates')).map((file) => [
    file.replace(/\.json$/, ''),
    readJson<TemplateFile>(join(root, 'templates', file)),
  ]),
);
const documents = readdirSync(root)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({
    name: file.replace(/\.json$/, ''),
    file: readJson<DocumentFile>(join(root, file)),
  }));

/** The documents that do not round-trip block for block, and why. */
const GAPS: Readonly<Record<string, string>> = {
  blockquotes: 'quotes nested in quotes are written flat',
  columns: 'columns are written as their blocks',
  'contents-lists': 'lists of contents are written as a field or left out',
  'cross-references': 'figures are written as placeholders',
  figures: 'figures are written as placeholders',
  'linked-code': 'linked code is written as code',
  'long-mixed': 'lists of contents, figures and display math',
  math: 'display math is written as a paragraph',
  'oversized-blocks': 'code in a quote is written after it',
  'roman-and-alpha-numbering': 'lists of contents are written as a field',
  scripts: 'scripts are written as their output',
  'template-blocks-and-variables': 'template blocks are written as their content',
};

function templateOf(file: DocumentFile): TemplateFile {
  const own = templates.get(file.template?.id ?? '');
  if (!own) throw new Error(`No template ${String(file.template?.id)}`);
  return resolveTemplateFile(own, { loadTemplate: (id) => templates.get(id) ?? null });
}

// A block's shape: its type, with a heading's level, a paragraph's level and style, a list's items.
function shapeOf(node: StoredNode): string {
  const attrs = node.attrs ?? {};
  switch (node.type) {
    case 'heading':
      return attrs.title === true
        ? 'title'
        : `h${String(attrs.level ?? 1)}${attrs.style ? `.${String(attrs.style)}` : ''}`;
    case 'paragraph':
      return `p${String(attrs.level ?? 1)}${attrs.style ? `.${String(attrs.style)}` : ''}`;
    default:
      return node.type;
  }
}

const shapes = (content: readonly StoredNode[]) => keptContent(content, 'accepted').map(shapeOf);

function count(content: readonly StoredNode[], type: string): number {
  return keptContent(content, 'accepted').reduce(
    (sum, node) => sum + (node.type === type ? 1 : 0) + count(node.content ?? [], type),
    0,
  );
}

describe.each(documents)(
  'the regression document $name through Word and back',
  ({ name, file }) => {
    it('DOCE-FORMAT-5.8 keeps its sections, blocks and footnotes', async () => {
      const template = templateOf(file);
      const read = await readDocx(writeDocx(file, { template }), { template });
      if (!read.ok) throw new Error(read.message);
      expect(read.file.sections.map((section) => section.name ?? null)).toEqual(
        file.sections.map((section) => section.name ?? null),
      );
      const written = read.file.sections.map((section) => shapes(section.content));
      const stored = file.sections.map((section) => shapes(section.content));
      if (GAPS[name]) expect(written).not.toEqual(stored);
      else expect(written).toEqual(stored);
      read.file.sections.forEach((section, index) => {
        const original = file.sections[index]?.content ?? [];
        expect(count(section.content, 'footnote')).toBe(count(original, 'footnote'));
      });
    });
  },
);
