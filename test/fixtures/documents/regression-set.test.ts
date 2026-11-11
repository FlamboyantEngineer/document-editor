// @vitest-environment node
// The regression set: generic stored documents and the templates they use, read from disk. Each
// document must read and write back to the same bytes, use a template of the set and only its
// sections, and give each element id it holds as a unique 8-digit hexadecimal string. Empty
// paragraphs and a locked section's template content carry none.

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
      const doc = readDocumentFile(file, documentSchema);
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
      const template = templates.get(String(file.template));
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
