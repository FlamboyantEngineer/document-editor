// @vitest-environment node
// Golden Markdown for the regression set: each document as `writeMarkdown` writes it, committed in
// `test/fixtures/markdown/`. A change to the writer shows as a change to these files; after a
// deliberate change, write them again with `npx vitest run -u src/model/format/markdown-golden`.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { DocumentFile } from './document-format.js';
import { type MarkdownOptions, type MarkdownThread, writeMarkdown } from './markdown.js';

const here = dirname(fileURLToPath(import.meta.url));
const documents = join(here, '../../../test/fixtures/documents');
const golden = join(here, '../../../test/fixtures/markdown');

const names = readdirSync(documents)
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.slice(0, -'.json'.length))
  .sort();

const read = (name: string) =>
  JSON.parse(readFileSync(join(documents, `${name}.json`), 'utf8')) as DocumentFile;

const PEOPLE: Readonly<Record<string, string>> = { 'p-01': 'Avery', 'p-02': 'Blake' };
const person = (id: string) => PEOPLE[id];
const entry = (author: string, text: string, day: number) => ({
  author,
  text,
  createdAt: `2026-11-0${String(day)}T09:00:00Z`,
});

// The threads of the comments document, as a host's comment store would give them.
const THREADS: MarkdownThread[] = [
  {
    id: 'thread-01',
    state: 'open',
    quote: 'commented phrase',
    entries: [entry('p-01', 'Is this the right word?', 1), entry('p-02', 'It reads well.', 2)],
  },
  {
    id: 'thread-02',
    state: 'resolved',
    quote: 'resolved one',
    entries: [entry('p-02', 'Done.', 3)],
  },
  { id: 'thread-03', state: 'open', quote: 'an insertion', entries: [] },
  {
    id: 'thread-04',
    state: 'open',
    quote: 'a deletion',
    entries: [entry('p-01', 'Why remove this?', 4)],
  },
  {
    id: 'thread-08',
    state: 'open',
    quote: '',
    scope: 'document',
    entries: [entry('p-02', 'Ready for a last read.', 5)],
  },
];

const VALUES: Readonly<Record<string, string>> = {
  'document.title': 'Reading room hours',
  'document.owner': 'Avery',
};

// What each document is written with beyond its content: the host's threads, values and properties.
const OPTIONS: Readonly<Record<string, MarkdownOptions>> = {
  'comments-and-suggestions': { threads: THREADS, suggestionList: true, person },
  'template-blocks-and-variables': {
    title: 'Reading room hours',
    frontMatter: { title: 'Reading room hours', owner: 'Avery', revision: 3 },
    values: { variable: (key) => VALUES[key] },
  },
  figures: { values: { asset: ({ id }) => `https://assets.example.com/${id}.png` } },
};

describe('writeMarkdown on the regression set', () => {
  it.each(names)('DOCE-FORMAT-4.9 writes %s as its golden Markdown', async (name) => {
    const markdown = writeMarkdown(read(name), OPTIONS[name]);
    await expect(markdown).toMatchFileSnapshot(join(golden, `${name}.md`));
  });

  it('DOCE-FORMAT-4.9 writes the comments document with its suggestions rejected', async () => {
    const markdown = writeMarkdown(read('comments-and-suggestions'), {
      suggestions: 'rejected',
    });
    await expect(markdown).toMatchFileSnapshot(
      join(golden, 'comments-and-suggestions.rejected.md'),
    );
  });
});
