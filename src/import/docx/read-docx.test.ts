// @vitest-environment node
import { type Command, EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { buildDocx, paragraph, run } from '../../../test/fixtures/docx/build-docx-fixture.js';
import {
  COMMENTS,
  IMAGES,
  NOTES,
  NUMBERING,
  SECTIONS,
  STYLES,
  TABLES,
  WRITER_SHAPES,
} from '../../../test/fixtures/docx/fixtures.js';
import {
  acceptAllSuggestions,
  listSuggestions,
  rejectAllSuggestions,
  rejectSuggestion,
} from '../../engine/suggestion-decisions.js';
import type { DocumentFile, StoredNode } from '../../model/format/document-format.js';
import { readDocumentFile } from '../../model/format/document-format-convert.js';
import { writeZip } from '../../model/format/zip.js';
import { createDocumentSchema } from '../../model/schema/document-schema.js';
import { composeDocumentFile } from '../../model/templates/template-sections.js';
import { type DocxRead, readDocx } from './read-docx.js';

type Read = Extract<DocxRead, { ok: true }>;

async function read(
  fixture: Parameters<typeof buildDocx>[0],
  options?: Parameters<typeof readDocx>[1],
) {
  const result = await readDocx(buildDocx(fixture), options);
  if (!result.ok) throw new Error(result.message);
  return result;
}

const blocks = (result: Read, section = 0) => result.file.sections[section]?.content ?? [];
const text = (value: string, ...marks: string[]): StoredNode => ({
  type: 'text',
  text: value,
  ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
});
const para = (...content: StoredNode[]): StoredNode => ({ type: 'paragraph', content });

describe('reading word processing documents', () => {
  it('DOCE-IMPORT-2.1 reads deflated and stored archives in Node without DOM globals', async () => {
    expect(typeof document).toBe('undefined');
    const deflated = await read({ body: paragraph(run('Hello')) });
    const stored = await read({ body: paragraph(run('Hello')), stored: true });
    expect(blocks(deflated)).toEqual([para(text('Hello'))]);
    expect(stored.file).toEqual(deflated.file);
    expect(deflated.pages).toEqual([null]);
  });

  it('DOCE-IMPORT-2.1 fails without throwing for files it cannot read', async () => {
    await expect(readDocx(new TextEncoder().encode('plain text'))).resolves.toMatchObject({
      ok: false,
      failure: 'unreadable',
    });
    const noDocument = writeZip([{ path: 'readme.txt', data: 'nothing' }]);
    await expect(readDocx(noDocument)).resolves.toMatchObject({ ok: false, failure: 'unreadable' });
    const big = buildDocx({ body: paragraph(run('x'.repeat(5000))) });
    await expect(readDocx(big, { limits: { fileBytes: 1000 } })).resolves.toMatchObject({
      ok: false,
      failure: 'too-large',
    });
    await expect(readDocx(big, { limits: { files: 2 } })).resolves.toMatchObject({
      ok: false,
      failure: 'too-large',
    });
  });

  it('DOCE-IMPORT-2.1 limits the bytes all the files read inflate to together', async () => {
    // Twenty images of 64 KB of zeros: each well under the limit for one file, too much together.
    const media = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [
        `zeros${String(index)}.png`,
        new Uint8Array(65536),
      ]),
    );
    const bytes = buildDocx({ body: paragraph(run('Images')), media });
    expect(bytes.length).toBeLessThan(65536);
    const limits = { fileBytes: 100_000, totalBytes: 1_000_000 };
    await expect(readDocx(bytes, { limits })).resolves.toMatchObject({
      ok: false,
      failure: 'too-large',
    });
    await expect(
      readDocx(bytes, { limits: { ...limits, totalBytes: 2_000_000 } }),
    ).resolves.toMatchObject({ ok: true });
    const stored = buildDocx({ body: paragraph(run('Images')), media, stored: true });
    await expect(readDocx(stored, { limits })).resolves.toMatchObject({
      ok: false,
      failure: 'too-large',
    });
  });

  it('DOCE-IMPORT-2.1 gives damaged deflate data as a damaged file', async () => {
    const bytes = buildDocx({
      body: paragraph(run('A paragraph long enough to deflate.'.repeat(20))),
    });
    const name = new TextEncoder().encode('word/document.xml');
    // The document part's local header, then its name, then its deflated data.
    let at = 0;
    while (!(
      bytes[at] === 0x50 &&
      bytes[at + 1] === 0x4b &&
      bytes[at + 2] === 3 &&
      bytes[at + 3] === 4 &&
      name.every((byte, index) => bytes[at + 30 + index] === byte)
    ))
      at += 1;
    const start = at + 30 + name.length;
    const damaged = bytes.slice();
    for (let index = start + 4; index < start + 24; index += 1) damaged[index] = 0xff;
    await expect(readDocx(damaged)).resolves.toMatchObject({ ok: false, failure: 'damaged' });
  });

  it('DOCE-IMPORT-2.2 reads a link written as a field, warning only about an unsafe address', async () => {
    const field = (instruction: string, shown: string) =>
      `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve">${instruction}</w:instrText></w:r>` +
      `<w:r><w:fldChar w:fldCharType="separate"/></w:r>${run(shown)}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
    const link = (value: string, href: string): StoredNode => ({
      type: 'text',
      text: value,
      marks: [{ type: 'link', attrs: { href } }],
    });
    const result = await read({
      body: [
        paragraph(`${run('See ')}${field(' HYPERLINK "https://example.com" ', 'the site')}`),
        paragraph(field(' HYPERLINK \\l "intro" ', 'the start')),
        paragraph(
          `<w:fldSimple w:instr=" HYPERLINK https://example.org/a ">${run('simple')}</w:fldSimple>`,
        ),
        paragraph(field(' HYPERLINK "javascript:alert(1)" ', 'unsafe')),
      ].join(''),
    });
    expect(blocks(result)).toEqual([
      para(text('See '), link('the site', 'https://example.com')),
      para(link('the start', '#intro')),
      para(link('simple', 'https://example.org/a')),
      para(text('unsafe')),
    ]);
    expect(result.warnings).toEqual([
      { code: 'content-left-out', detail: 'unsafe link', count: 1 },
      { code: 'field-as-text', detail: 'HYPERLINK', count: 1 },
    ]);
  });

  it('DOCE-IMPORT-2.2 leaves out a link to an unsafe address', async () => {
    const result = await read({
      body: paragraph(`<w:hyperlink r:id="rIdBad">${run('bad')}</w:hyperlink>`),
      links: { rIdBad: 'javascript:alert(1)' },
    });
    expect(blocks(result)).toEqual([para(text('bad'))]);
    expect(result.warnings).toEqual([
      { code: 'content-left-out', detail: 'unsafe link', count: 1 },
    ]);
  });

  it('DOCE-IMPORT-2.2 reads headings, the title, levels, custom styles, quotes and code', async () => {
    const result = await read(STYLES, { template: { styles: { custom: { lead: {} } } } });
    expect(blocks(result).slice(0, 11)).toEqual([
      { type: 'heading', attrs: { title: true }, content: [text('Garden notes')] },
      { type: 'heading', content: [text('Beds')] },
      { type: 'heading', attrs: { level: 2 }, content: [text('North bed')] },
      { type: 'heading', attrs: { level: 3 }, content: [text('Soil')] },
      { type: 'paragraph', attrs: { level: 3 }, content: [text('A third-level paragraph.')] },
      { type: 'paragraph', attrs: { style: 'lead' }, content: [text('A lead paragraph.')] },
      { type: 'heading', attrs: { level: 2, style: 'lead' }, content: [text('A custom heading.')] },
      para(text('An aside.')),
      para(text('A fancy paragraph.')),
      { type: 'blockquote', content: [para(text('Quoted once.')), para(text('Quoted twice.'))] },
      { type: 'codeBlock', content: [text('let rows = 4;\nplant(rows);')] },
    ]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        { code: 'style-left-out', detail: 'aside', count: 1 },
        { code: 'style-left-out', detail: 'Fancy', count: 1 },
      ]),
    );
  });

  it('DOCE-IMPORT-2.2 reads run formats, links, page breaks, page fields and variables', async () => {
    const result = await read(STYLES);
    const [formats, before, pageBreak, after, fields, math] = blocks(result).slice(11);
    expect(formats?.content).toEqual([
      text('bold', 'bold'),
      text(' italic', 'italic'),
      text(' under', 'underline'),
      text(' struck', 'strike'),
      text('2', 'superscript'),
      text(' code', 'code'),
      text(' red plain'),
      {
        type: 'text',
        text: 'the beds',
        marks: [{ type: 'link', attrs: { href: 'https://example.test/beds' } }],
      },
    ]);
    expect([before, pageBreak, after]).toEqual([
      para(text('Before the break.')),
      { type: 'pageBreak' },
      para(text('After it.')),
    ]);
    expect(fields?.content).toEqual([
      text('Page '),
      { type: 'variable', attrs: { key: 'page.current' } },
      text(' on 1 May for '),
      { type: 'variable', attrs: { key: 'station.name' } },
    ]);
    expect(math).toEqual({ type: 'mathBlock', attrs: { source: 'x=2' } });
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        { code: 'formatting-left-out', detail: 'colour', count: 1 },
        { code: 'field-as-text', detail: 'DATE', count: 1 },
        { code: 'equation-as-text', detail: '', count: 1 },
      ]),
    );
  });

  it('DOCE-IMPORT-2.3 reads lists, nesting, start numbers and numbered paragraphs', async () => {
    const [heading, bullets, numbers, numbered] = blocks(await read(NUMBERING));
    const item = (value: string, ...nested: StoredNode[]): StoredNode => ({
      type: 'listItem',
      content: [para(text(value)), ...nested],
    });
    expect(heading).toEqual({ type: 'heading', content: [text('Tools')] });
    expect(bullets).toEqual({
      type: 'bulletList',
      content: [item('Spade', { type: 'bulletList', content: [item('Blade')] }), item('Fork')],
    });
    expect(numbers).toEqual({
      type: 'orderedList',
      attrs: { start: 3 },
      content: [
        item('Third'),
        item('Fourth', { type: 'orderedList', content: [item('Nested letter')] }),
      ],
    });
    expect(numbered).toEqual({
      type: 'paragraph',
      attrs: { level: 2 },
      content: [text('A numbered paragraph.')],
    });
  });

  it('DOCE-IMPORT-2.4 reads tables with widths, spans, header rows, shading and a caption', async () => {
    const [table] = blocks(await read(TABLES));
    expect(table?.attrs).toEqual({ caption: 'Rainfall' });
    const [head, first, second] = table?.content ?? [];
    expect(head?.content?.map((cell) => [cell.type, cell.attrs])).toEqual([
      ['tableHeader', { colwidth: [100] }],
      ['tableHeader', { colspan: 2, colwidth: [200, 100] }],
    ]);
    expect(first?.content?.map((cell) => cell.attrs)).toEqual([
      { colwidth: [100], verticalAlign: 'bottom', rowspan: 2 },
      { colwidth: [200] },
      { colwidth: [100], background: '#ffee00' },
    ]);
    expect(second?.content).toHaveLength(2);
    expect(second?.content?.[1]?.content?.[0]?.type).toBe('table');
  });

  it('DOCE-IMPORT-2.3 starts a new list where the numbering changes', async () => {
    const result = await read({
      numbering: [
        '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>',
        '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>',
        '<w:num w:numId="2"><w:abstractNumId w:val="0"/></w:num>',
      ].join(''),
      body: ['One', 'Two', 'Again one', 'Again two']
        .map((value, index) =>
          paragraph(
            run(value),
            `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${index < 2 ? '1' : '2'}"/></w:numPr>`,
          ),
        )
        .join(''),
    });
    expect(blocks(result).map((list) => [list.type, list.content?.length])).toEqual([
      ['orderedList', 2],
      ['orderedList', 2],
    ]);
  });

  it('DOCE-IMPORT-2.4 keeps a column span within the grid and the editor’s limit', async () => {
    const schema = createDocumentSchema();
    const cell = (span: string) =>
      `<w:tc><w:tcPr><w:gridSpan w:val="${span}"/></w:tcPr>${paragraph(run('x'))}</w:tc>`;
    const table = (grid: string, span: string) =>
      `<w:tbl><w:tblGrid>${grid}</w:tblGrid><w:tr>${cell(span)}</w:tr></w:tbl>`;
    const result = await read({
      body: [
        table('<w:gridCol w:w="1500"/><w:gridCol w:w="1500"/><w:gridCol w:w="1500"/>', '5000'),
        table('', '5000'),
        table('', 'many'),
      ].join(''),
    });
    expect(blocks(result).map((each) => each.content?.[0]?.content?.[0]?.attrs?.colspan)).toEqual([
      3,
      1000,
      undefined,
    ]);
    expect(() => readDocumentFile(result.file, schema)).not.toThrow();
  });

  it('DOCE-IMPORT-2.2 reads a bottom-border paragraph as a rule and leaves out section-only paragraphs', async () => {
    const result = await read(WRITER_SHAPES);
    expect(blocks(result).map((node) => node.type)).toEqual([
      'codeBlock',
      'codeBlock',
      'rule',
      'paragraph',
      'bulletList',
      'paragraph',
      'paragraph',
    ]);
    expect(blocks(result)[3]).toEqual({ type: 'paragraph' });
    expect(blocks(result).slice(5)).toEqual([
      para(text('After the list.')),
      para(text('Not in a list.')),
    ]);
    expect(blocks(result, 1)).toEqual([]);
    expect(blocks(result, 2)).toEqual([para(text('Last section.'))]);
  });

  it('DOCE-IMPORT-2.3 reads a list paragraph after a list item as another paragraph of that item', async () => {
    const list = blocks(await read(WRITER_SHAPES))[4];
    expect(list).toEqual({
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            para(text('Plant')),
            para(text('Water it daily.')),
            {
              type: 'bulletList',
              content: [
                { type: 'listItem', content: [para(text('Prune')), para(text('Only in spring.'))] },
              ],
            },
          ],
        },
      ],
    });
  });

  it('DOCE-IMPORT-2.4 reads a caption before or after a code block as its caption', async () => {
    const [below, above] = blocks(await read(WRITER_SHAPES));
    expect(below).toEqual({
      type: 'codeBlock',
      attrs: { caption: 'Below the code' },
      content: [text('let rain = 1;')],
    });
    expect(above).toEqual({
      type: 'codeBlock',
      attrs: { caption: 'Above the code' },
      content: [text('let sun = 2;')],
    });
  });

  it('DOCE-IMPORT-2.5 reads sections with their names, pages, headers and footers', async () => {
    const result = await read(SECTIONS);
    const [cover, body] = result.file.sections;
    const footer = [
      para(text('Page '), { type: 'variable', attrs: { key: 'page.current' } }, text(' of '), {
        type: 'variable',
        attrs: { key: 'page.total' },
      }),
    ];
    expect(cover).toMatchObject({
      name: 'cover',
      header: { content: [para(text('Station log'))] },
      footer: { content: footer },
    });
    expect(body?.name).toBeUndefined();
    expect(body?.footer).toEqual({ content: footer });
    expect(body?.content).toEqual([para(text('Body text.'))]);
    expect(result.pages.map((page) => [page?.size, page?.orientation])).toEqual([
      ['A5', 'portrait'],
      ['A4', 'landscape'],
    ]);
    expect(result.pages[0]?.margins).toEqual({
      top: '72pt',
      right: '57pt',
      bottom: '72pt',
      left: '57pt',
    });
  });

  it('DOCE-IMPORT-2.6 reads footnotes and endnotes where they are cited', async () => {
    const [cited] = blocks(await read(NOTES));
    expect(cited?.content).toEqual([
      text('Rain fell'),
      {
        type: 'footnote',
        content: [
          text(' Measured at '),
          text('noon', 'italic'),
          { type: 'lineBreak' },
          text('Second line.'),
        ],
      },
      text(' twice'),
      { type: 'footnote', content: [text('An endnote.')] },
      text('.'),
    ]);
  });

  it('DOCE-IMPORT-2.7 reads comment threads with replies and resolution, and tracked changes', async () => {
    let next = 0;
    const result = await read(COMMENTS, {
      newId: () => (next += 1).toString(16).padStart(8, '0'),
    });
    const [first, second, changes] = blocks(result);
    expect(first?.content?.[1]).toEqual({
      type: 'text',
      text: 'checked',
      marks: [{ type: 'comment', attrs: { thread: 'comment-0', state: 'resolved' } }],
    });
    expect(second?.content?.[0]).toEqual({
      type: 'text',
      text: 'open',
      marks: [{ type: 'comment', attrs: { thread: 'comment-2' } }],
    });
    const change = (value: string, type: string, id: string): StoredNode => ({
      type: 'text',
      text: value,
      marks: [{ type, attrs: { id, author: 'Ada' } }],
    });
    expect(changes?.content).toEqual([
      text('Keep '),
      change('new', 'insertion', '00000001'),
      change('old', 'deletion', '00000002'),
      text('.'),
    ]);
    expect(result.comments).toEqual([
      {
        id: 'comment-0',
        state: 'resolved',
        quote: 'checked',
        suggestion: null,
        author: 'Ada',
        createdAt: '2026-01-02T10:00:00Z',
        entries: [
          {
            id: 'comment-0',
            author: 'Ada',
            text: 'Check this.',
            createdAt: '2026-01-02T10:00:00Z',
          },
          { id: 'comment-1', author: 'Ben', text: 'Done.', createdAt: '2026-01-02T11:00:00Z' },
        ],
      },
      expect.objectContaining({ id: 'comment-2', state: 'open', quote: 'open' }),
    ]);
  });

  it('DOCE-IMPORT-2.7 gives tracked changes as suggestions with their authors, to accept or reject', async () => {
    const schema = createDocumentSchema();
    const { file } = await read({
      body: paragraph(
        `${run('Keep ')}<w:ins w:id="1" w:author="Ann" w:date="2026-01-02T10:00:00Z">${run('new')}</w:ins>` +
          `<w:del w:id="2" w:author="Ben"><w:r><w:delText>old</w:delText></w:r></w:del>` +
          `<w:moveFrom w:id="3" w:author="Ann">${run(' here')}</w:moveFrom>` +
          `<w:moveTo w:id="4" w:author="Ann">${run(' there')}</w:moveTo>`,
      ),
    });
    const doc = readDocumentFile(file, schema).doc;
    const suggestions = listSuggestions(doc);
    expect(
      suggestions.map(({ author, inserted, deleted }) => ({ author, inserted, deleted })),
    ).toEqual([
      { author: 'Ann', inserted: 'new', deleted: '' },
      { author: 'Ben', inserted: '', deleted: 'old' },
      { author: 'Ann', inserted: '', deleted: ' here' },
      { author: 'Ann', inserted: ' there', deleted: '' },
    ]);
    expect(new Set(suggestions.map((each) => each.id)).size).toBe(4);
    const decided = (command: Command) => {
      let state = EditorState.create({ doc });
      command(state, (tr) => (state = state.apply(tr)));
      return state.doc.textContent;
    };
    expect(decided(acceptAllSuggestions)).toBe('Keep new there');
    expect(decided(rejectAllSuggestions)).toBe('Keep old here');
    expect(decided(rejectSuggestion(suggestions[0]?.id ?? ''))).toBe('Keep old here there');
  });

  it('DOCE-IMPORT-2.8 reads images and figures and warns about what it leaves out', async () => {
    const result = await read(IMAGES);
    const [inline, figure] = blocks(result);
    const src = 'data:image/png;base64,iVBORw==';
    expect(inline?.content?.[1]).toEqual({
      type: 'image',
      attrs: { src, alt: 'icon', width: 100, height: 50 },
    });
    expect(figure).toEqual({
      type: 'figure',
      attrs: { src, alt: 'Plot plan', width: 100, height: 50, caption: 'Plot plan of the beds' },
    });
    expect(result.images.map((image) => [image.path, image.mediaType])).toEqual([
      ['word/media/plot.png', 'image/png'],
    ]);
    expect(result.warnings).toEqual([
      { code: 'image-left-out', detail: 'word/media/old.emf', count: 1 },
      { code: 'image-left-out', detail: 'linked image', count: 1 },
      { code: 'content-left-out', detail: 'chart', count: 1 },
    ]);
    const hosted = await read(IMAGES, { imageSource: (image) => `asset:${image.path}` });
    expect(blocks(hosted)[1]?.attrs?.src).toBe('asset:word/media/plot.png');
  });

  it('DOCE-IMPORT-2.9 gives documents that read in the editor and compose into a template', async () => {
    const schema = createDocumentSchema();
    for (const fixture of [STYLES, NUMBERING, SECTIONS, NOTES, COMMENTS, TABLES, IMAGES]) {
      const { file }: { file: DocumentFile } = await read(fixture);
      expect(() => readDocumentFile(file, schema)).not.toThrow();
      let next = 0;
      const composed = composeDocumentFile(file, {
        template: { formatVersion: 1, id: 'plain' },
        newId: () => (next += 1).toString(16).padStart(8, '0'),
      });
      expect(() => readDocumentFile(composed, schema)).not.toThrow();
    }
  });
});
