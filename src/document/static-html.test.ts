import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { type DocumentFile, readDocumentFile, writeHtml } from '../model/index.js';
import { writeStaticHtml } from './static-html.js';

// Every stored node and mark type, each with its attributes set (DOCE-FORMAT-7.2), and the
// regression set's documents.
const folders = ['../../test/fixtures/format/', '../../test/fixtures/documents/'].map(
  (path) => new URL(path, import.meta.url),
);
const files = folders.flatMap((folder) =>
  readdirSync(folder)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => ({
      name,
      file: JSON.parse(readFileSync(new URL(name, folder), 'utf8')) as DocumentFile,
    })),
);

// Markup as the DOM reads and writes it again, which spells each style declaration its own way.
function reread(html: string): string {
  const container = document.createElement('div');
  container.innerHTML = html;
  for (const element of container.querySelectorAll<HTMLElement>('[style]'))
    element.setAttribute('style', element.style.cssText);
  return container.innerHTML;
}

describe('writeStaticHtml', () => {
  it.each(files)('DOCE-FORMAT-6.4 writes $name as writeHtml writes it, with no DOM', ({ file }) => {
    const { doc } = readDocumentFile(file, documentSchema, { unknown: 'keep' });
    expect(reread(writeStaticHtml(doc))).toBe(reread(writeHtml(doc, document)));
  });

  it('DOCE-FORMAT-6.4 escapes text and attribute values as a browser writes them', () => {
    const { doc } = readDocumentFile(
      {
        formatVersion: 1,
        sections: [
          {
            name: null,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'a < b & "c" d',
                    marks: [{ type: 'link', attrs: { href: 'https://a.test/?x=1&y="2"' } }],
                  },
                ],
              },
            ],
          },
        ],
      },
      documentSchema,
    );
    const written = writeStaticHtml(doc);
    expect(written).toBe(writeHtml(doc, document));
    expect(written).toContain('a &lt; b &amp; "c"&nbsp;d');
    expect(written).toContain('href="https://a.test/?x=1&amp;y=&quot;2&quot;"');
  });
});
