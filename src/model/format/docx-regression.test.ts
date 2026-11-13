// @vitest-environment node
// Every document of the regression set, exported to a word processing document with its template:
// the structure of the parts it writes, checked against the stored document and its template.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { countMatches, readZipParts } from '../../../test/docx-parts.js';
import { findTemplateSection } from '../templates/template-sections.js';
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

function templateOf(file: DocumentFile): TemplateFile {
  const own = templates.get(file.template?.id ?? '');
  if (!own) throw new Error(`No template ${String(file.template?.id)}`);
  return resolveTemplateFile(own, { loadTemplate: (id) => templates.get(id) ?? null });
}

// The kept nodes of stored content, at any depth, that pass a test.
function nodesOf(
  content: readonly StoredNode[],
  test: (node: StoredNode) => boolean,
): StoredNode[] {
  return keptContent(content, 'accepted').flatMap((node) => [
    ...(test(node) ? [node] : []),
    ...nodesOf(node.content ?? [], test),
  ]);
}

const threadIds = (file: DocumentFile) => [
  ...new Set(
    nodesOf(
      file.sections.flatMap((section) => section.content),
      (node) => node.type === 'text',
    ).flatMap((node) =>
      (node.marks ?? [])
        .filter((mark) => mark.type === 'comment')
        .map((mark) => String(mark.attrs?.thread)),
    ),
  ),
];

describe.each(documents)('the regression document $name in Word', ({ file }) => {
  const template = templateOf(file);
  const threads = threadIds(file).map((id) => ({
    id,
    state: 'open' as const,
    entries: [
      { author: 'p1', text: `About ${id}` },
      { author: 'p2', text: 'A reply' },
    ],
  }));
  const parts = readZipParts(writeDocx(file, { template, comments: { threads } }));
  const document = parts.get('word/document.xml') ?? '';
  const content = file.sections.flatMap((section) => section.content);

  it('DOCE-FORMAT-5.4 DOCE-FORMAT-5.5 writes the template styles and numbering definitions', () => {
    const styles = parts.get('word/styles.xml') ?? '';
    for (const id of [
      'Normal',
      'Title',
      'Heading1',
      'Heading6',
      'ParagraphLevel2',
      'Code',
      'Caption',
    ]) {
      expect(styles).toContain(`w:styleId="${id}"`);
    }
    for (const key of Object.keys(template.styles?.custom ?? {})) {
      expect(styles).toContain(`w:styleId="Custom_${key}"`);
    }
    const numbering = parts.get('word/numbering.xml') ?? '';
    for (const kind of ['Headings', 'Paragraphs', 'Bullets', 'Numbers']) {
      expect(numbering).toContain(`<w:name w:val="${kind}"/>`);
    }
  });

  it('DOCE-FORMAT-5.5 numbers each heading of the structure and leaves the title unnumbered', () => {
    const headings = nodesOf(
      content,
      (node) => node.type === 'heading' && node.attrs?.title !== true,
    );
    const titles = nodesOf(
      content,
      (node) => node.type === 'heading' && node.attrs?.title === true,
    );
    const numbered = countMatches(document, /<w:pStyle w:val="Heading\d"\/><w:numPr>/);
    expect(numbered).toBeLessThanOrEqual(headings.length);
    const top = file.sections.flatMap((section) =>
      keptContent(section.content, 'accepted').filter(
        (node) => node.type === 'heading' && node.attrs?.title !== true,
      ),
    );
    if (template.styles?.heading1?.numbering?.format) {
      expect(numbered).toBeGreaterThanOrEqual(top.length);
    }
    expect(countMatches(document, /<w:pStyle w:val="Title"\/>/)).toBe(titles.length);
  });

  it('DOCE-FORMAT-5.6 writes each section with its page and its header and footer', () => {
    expect(countMatches(document, /<w:sectPr>/)).toBe(file.sections.length);
    const sizes = [...document.matchAll(/<w:pgSz w:w="(\d+)" w:h="(\d+)"/g)];
    file.sections.forEach((section, index) => {
      const page = { ...template.page, ...findTemplateSection(template, section.name)?.page };
      const [, width = '0', height = '0'] = sizes[index] ?? [];
      expect(Number(width) > Number(height)).toBe(page.orientation === 'landscape');
    });
    if (template.footer?.content?.length) {
      expect(countMatches(document, /<w:footerReference /)).toBe(file.sections.length);
      const footers = [...parts].filter(([path]) => /^word\/footer\d+\.xml$/.test(path));
      expect(footers.length).toBeGreaterThan(0);
      if (JSON.stringify(template.footer.content).includes('page.current')) {
        expect(footers.some(([, data]) => data.includes('w:instr=" PAGE "'))).toBe(true);
      }
    }
    const names = file.sections.map((section) => section.name ?? '');
    expect(parts.get('word/settings.xml')).toContain(
      `w:val="${JSON.stringify(names).replace(/"/g, '&quot;')}"`,
    );
  });

  it('DOCE-FORMAT-5.7 writes every footnote and every anchored comment thread', () => {
    const footnotes = nodesOf(content, (node) => node.type === 'footnote');
    expect(countMatches(document, /<w:footnoteReference /)).toBe(footnotes.length);
    expect(countMatches(parts.get('word/footnotes.xml') ?? '', /<w:footnote w:id="[1-9]/)).toBe(
      footnotes.length,
    );
    expect(countMatches(document, /<w:commentReference /)).toBe(threads.length * 2);
    if (threads.length) {
      expect(countMatches(parts.get('word/comments.xml') ?? '', /<w:comment /)).toBe(
        threads.length * 2,
      );
      expect(countMatches(parts.get('word/commentsExtended.xml') ?? '', /w15:paraIdParent=/)).toBe(
        threads.length,
      );
    }
  });
});
