// @vitest-environment node
// The regression set: generic stored documents and the templates they use, read from disk. Each
// document must read and write back to the same bytes, use a template of the set and only its
// sections, and give each element id it holds as a unique 8-digit hexadecimal string. A
// locked section's template content carries none.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';
import {
  type DocumentFile,
  readDocumentFile,
  resolveTemplateFile,
  type StoredNode,
  type TemplateFile,
  validateTemplateFile,
  writeDocumentFile,
} from '../../../src/model/index.js';
import { documentSchema } from '../../document-markup.js';

const here = dirname(fileURLToPath(import.meta.url));

function readJsonFiles(dir: string): { name: string; text: string }[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      name: file.slice(0, -'.json'.length),
      text: readFileSync(join(dir, file), 'utf8'),
    }));
}

const documents = readJsonFiles(here).map(({ name, text }) => ({
  name,
  text,
  file: JSON.parse(text) as DocumentFile,
}));
const templates = new Map(
  readJsonFiles(join(here, 'templates')).map(({ name, text }) => [
    name,
    JSON.parse(text) as TemplateFile,
  ]),
);

/** The JSON a stored value is committed as. */
async function committedJson(value: unknown): Promise<string> {
  const config = (await resolveConfig(join(here, 'document.json'))) ?? {};
  return format(JSON.stringify(value, null, 2), { ...config, parser: 'json' });
}

/** The element ids a stored document holds; a footnote stores its element id as `elementId`. */
function elementIds(nodes: readonly StoredNode[], ids: unknown[] = []): unknown[] {
  for (const node of nodes) {
    const id = node.type === 'footnote' ? node.attrs?.elementId : node.attrs?.id;
    if (id !== undefined) ids.push(id);
    if (node.content) elementIds(node.content, ids);
  }
  return ids;
}

describe('regression set', () => {
  it('DOCE-FORMAT-1.1 holds at least thirty documents whose elements carry ids', () => {
    expect(documents.length).toBeGreaterThanOrEqual(30);
    const withIds = documents.filter(({ file }) =>
      file.sections.some((section) => elementIds(section.content).length > 0),
    );
    expect(withIds.length).toBeGreaterThanOrEqual(30);
  });

  it.each(documents)(
    'DOCE-FORMAT-1.1 reads $name and writes it back to the same bytes',
    async ({ text, file }) => {
      const doc = readDocumentFile(file, documentSchema).doc;
      expect(await committedJson(writeDocumentFile(doc, { template: file.template }))).toBe(text);
    },
  );

  it.each(documents)('DOCE-FORMAT-1.1 gives every element of $name a unique id', ({ file }) => {
    const ids = file.sections.flatMap((section) => elementIds(section.content));
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}$/);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each([...templates.values()])('DOCE-FORMAT-2.4 template $id is valid', (template) => {
    expect(validateTemplateFile(template, { schema: documentSchema })).toEqual([]);
  });

  it.each(documents)(
    'DOCE-FORMAT-3.2 $name uses a template of the set and only its sections',
    ({ file }) => {
      const template = templates.get(String(file.template?.id));
      expect(template).toBeDefined();
      if (!template) return;
      const resolved = resolveTemplateFile(template, { loadTemplate: (id) => templates.get(id) });
      const sections = new Map((resolved.sections ?? []).map((section) => [section.name, section]));
      for (const section of file.sections) {
        if (section.name == null) continue;
        const own = sections.get(section.name);
        expect(own, section.name).toBeDefined();
        // A section the author cannot edit keeps the template's content.
        if (own?.editable === false) expect(section.content).toEqual(own.content);
      }
    },
  );
});

// A list's shape: for each item, the shape of the list nested in it, or 0 for none.
type Shape = number | Shape[];
const shapeOf = (list: StoredNode): Shape[] =>
  (list.content ?? []).map((item) => {
    const nested = item.content?.find((child) => child.type.endsWith('List'));
    return nested ? shapeOf(nested) : 0;
  });

describe('list split stress', () => {
  it('DOCE-LABS-4.3 holds the four ordered lists before its runways', () => {
    const file = JSON.parse(
      readFileSync(join(here, 'list-split-stress.json'), 'utf8'),
    ) as DocumentFile;
    const lists = (file.sections[0]?.content ?? []).filter((node) => node.type.endsWith('List'));
    const [single, pairs, long, deep, ...runways] = lists;
    const times = <T>(count: number, value: T) => Array.from({ length: count }, () => value);
    expect(single && shapeOf(single)).toEqual(times(30, 0));
    expect(pairs && shapeOf(pairs)).toEqual(times(30, [0, 0]));
    expect(long && shapeOf(long)).toEqual(times(2, times(20, 0)));
    expect(deep && shapeOf(deep)).toEqual(times(20, [[0], [0]]));
    expect([single, pairs, long, deep].map((list) => list?.type)).toEqual(times(4, 'orderedList'));
    expect(runways.map((list) => (list.content ?? []).length)).toEqual([60, 60]);
  });
});

// The block types a section holds at its top level, each once.
const typesOf = (file: DocumentFile, name: string) =>
  new Set(file.sections.find((section) => section.name === name)?.content.map(({ type }) => type));

describe('numbering stress', () => {
  const read = (name: string) =>
    JSON.parse(readFileSync(join(here, `${name}.json`), 'utf8')) as DocumentFile;
  const objects = ['figure', 'table', 'codeBlock', 'mathBlock'];

  it('DOCE-LABS-4.12 holds Roman lists from their subtractive and thousand edges', () => {
    const file = read('roman-numbering-coverage');
    const starts = (file.sections[1]?.content ?? [])
      .filter((node) => node.type === 'orderedList')
      .map((list) => Number(list.attrs?.start ?? 1));
    expect(starts).toEqual(
      expect.arrayContaining([3, 8, 38, 48, 98, 398, 498, 898, 998, 3998, 3999, 7998, 12000]),
    );
    for (const section of ['body', 'annex']) {
      expect([...typesOf(file, section)]).toEqual(expect.arrayContaining(objects));
    }
  });

  it('DOCE-LABS-4.13 holds four object kinds in three sections and a list of each', () => {
    const file = read('caption-numbering');
    for (const section of ['body', 'annex']) {
      expect([...typesOf(file, section)]).toEqual(expect.arrayContaining(objects));
    }
    const kinds = (file.sections[0]?.content ?? [])
      .filter((node) => node.type === 'contents')
      .map((node) => node.attrs?.kind);
    expect(kinds).toEqual(['figures', 'tables', 'codeBlocks', 'equations']);
  });
});
