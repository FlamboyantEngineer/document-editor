// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildDocx,
  paragraph,
  run,
  style,
} from '../../../test/fixtures/docx/build-docx-fixture.js';
import type { StoredNode } from '../../model/format/document-format.js';
import { storedBodyOf, storedCaptionText } from '../../model/schema/caption-content.js';
import { type DocxRead, type DocxReadOptions, readDocx } from './read-docx.js';

type Read = Extract<DocxRead, { ok: true }>;

const STYLES = [
  ['Caption', 'caption'],
  ['Heading1', 'heading 1'],
  ['Heading2', 'heading 2'],
  ['Heading8', 'heading 8'],
  ['Title', 'Title'],
  ['TOC1', 'toc 1'],
  ['MyToc', 'My contents', 'TOC1'],
  ['TOCHeading', 'TOC Heading'],
  ['Deep', 'Deep outline', '', '<w:pPr><w:outlineLvl w:val="7"/></w:pPr>'],
  ['AppendixHeading', 'heading 1 appendix', 'Heading1'],
]
  .map(
    ([id, name, basedOn, properties]) =>
      `<w:style w:type="paragraph" w:styleId="${id ?? ''}"><w:name w:val="${name ?? ''}"/>${basedOn ? `<w:basedOn w:val="${basedOn}"/>` : ''}${properties ?? ''}</w:style>`,
  )
  .join('');

const PICTURE =
  '<w:r><w:drawing><wp:inline><wp:extent cx="952500" cy="476250"/><wp:docPr id="1" name="p"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:blipFill><a:blip r:embed="rIdplot"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
const figure = paragraph(PICTURE);
const table = (text = 'Cell') =>
  `<w:tbl><w:tblGrid><w:gridCol w:w="1500"/></w:tblGrid><w:tr><w:tc>${paragraph(run(text))}</w:tc></w:tr></w:tbl>`;
const blank = '<w:p/>';
const seq = (label: string, number: string) =>
  `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> SEQ ${label} \\* ARABIC </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${run(number)}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
const bookmark = (name: string, content: string) =>
  `<w:bookmarkStart w:id="9" w:name="${name}"/>${content}<w:bookmarkEnd w:id="9"/>`;
const field = (instruction: string, result: string) =>
  `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${instruction} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${run(result)}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;

async function read(body: string[], options: DocxReadOptions = {}): Promise<Read> {
  const result = await readDocx(
    buildDocx({
      styles: STYLES,
      media: { 'plot.png': new Uint8Array([137, 80, 78, 71]) },
      body: body.join(''),
    }),
    { newId: counter(), ...options },
  );
  if (!result.ok) throw new Error(result.message);
  return result;
}

function counter() {
  let next = 0;
  return () => (next += 1).toString(16).padStart(8, '0');
}

const blocks = (result: Read) => result.file.sections[0]?.content ?? [];
const textOf = (node: StoredNode | undefined): string =>
  node?.type === 'text' ? (node.text ?? '') : (node?.content ?? []).map(textOf).join('');
const summary = (result: Read) =>
  blocks(result).map((node) =>
    ['table', 'figure'].includes(node.type)
      ? `${node.type}:${storedCaptionText(node) || '-'}`
      : `${node.type}:${textOf(node)}`,
  );
const codes = (result: Read) =>
  result.warnings.map(({ code, count, group }) => `${group} ${code} ${String(count)}`);

describe('reading the structure of word processing documents', () => {
  it('DOCE-IMPORT-2.10 joins Word captions to the figure above and the table below, label and number taken off', async () => {
    const result = await read([
      figure,
      paragraph(`${run('Figure ')}${seq('Figure', '1')}${run(': A plot')}`, style('Caption')),
      paragraph(`${run('Table ')}${seq('Table', '1')}${run(' - Rain')}`, style('Caption')),
      table(),
      paragraph(run('Figure 2. Drawn by hand'), style('Caption')),
      blank,
      figure,
    ]);
    expect(summary(result)).toEqual([
      'figure:A plot',
      'table:Rain',
      'paragraph:',
      'figure:Drawn by hand',
    ]);
    expect(codes(result)).toContain('applied caption-numbered 3');
  });

  it('DOCE-IMPORT-2.10 reads a caption field in any paragraph and a labelled paragraph as captions', async () => {
    const result = await read([
      table(),
      paragraph(`${run('Table ')}${seq('Table', '4')}${run('. Below')}`),
      paragraph(run('Table 3 \u2013 Above the next')),
      blank,
      blank,
      table(),
      paragraph(run('Table 2 shows the rain.')),
      paragraph(run('Fig. 7: Plain text caption')),
      figure,
    ]);
    expect(summary(result)).toEqual([
      'table:Below',
      'paragraph:',
      'paragraph:',
      'table:Above the next',
      'paragraph:Table 2 shows the rain.',
      'figure:Plain text caption',
    ]);
  });

  it('DOCE-IMPORT-2.10 leaves text captions as paragraphs when they are turned off, Word captions not', async () => {
    const result = await read(
      [
        paragraph(run('Table 1. Text')),
        table(),
        figure,
        paragraph(run('Plotted'), style('Caption')),
      ],
      { textCaptions: false },
    );
    expect(summary(result)).toEqual(['paragraph:Table 1. Text', 'table:-', 'figure:Plotted']);
  });

  it('DOCE-IMPORT-2.10 keeps a caption with nothing to caption, or beside a captioned block, as a paragraph', async () => {
    const result = await read([
      paragraph(run('Figure 1: Lonely'), style('Caption')),
      paragraph(run('Between')),
      table(),
      paragraph(run('Table 1: First'), style('Caption')),
      paragraph(run('Table 2: Second'), style('Caption')),
      paragraph(run('After')),
    ]);
    expect(summary(result)).toEqual([
      'paragraph:Figure 1: Lonely',
      'paragraph:Between',
      'table:First',
      'paragraph:Table 2: Second',
      'paragraph:After',
    ]);
    expect(codes(result)).toEqual(
      expect.arrayContaining(['not-imported caption-left-out 2', 'applied caption-numbered 1']),
    );
  });

  it('DOCE-IMPORT-2.11 points cross-references at the heading, figure or table their bookmark marks', async () => {
    const result = await read([
      paragraph(bookmark('_Ref1', run('Scope')), style('Heading1')),
      figure,
      paragraph(
        `${bookmark('_Ref2', `${run('Figure ')}${seq('Figure', '1')}`)}${run(': Plot')}`,
        style('Caption'),
      ),
      paragraph(
        `${run('See ')}${field('REF _Ref2 \\h', 'Figure 1')}${run(' and ')}${field('REF _Ref1 \\h', 'Scope')}${run(' or ')}${field('REF _Missing \\h', 'gone')}`,
      ),
    ]);
    const [heading, plot, cites] = blocks(result);
    expect(heading?.attrs?.id).toBe('00000002');
    expect(plot?.attrs).toMatchObject({ id: '00000001' });
    expect(plot && storedCaptionText(plot)).toBe('Plot');
    expect(cites?.content).toEqual([
      { type: 'text', text: 'See ' },
      {
        type: 'text',
        text: 'Figure 1',
        marks: [
          { type: 'reference', attrs: { referenceType: 'internal-figure', target: '00000001' } },
        ],
      },
      { type: 'text', text: ' and ' },
      {
        type: 'text',
        text: 'Scope',
        marks: [
          { type: 'reference', attrs: { referenceType: 'internal-heading', target: '00000002' } },
        ],
      },
      { type: 'text', text: ' or ' },
      { type: 'text', text: 'gone' },
    ]);
    expect(codes(result)).toContain('not-imported field-as-text 1');
  });

  it('DOCE-IMPORT-2.12 takes typed numbers off headings, across runs, keeping meaningful numbers', async () => {
    const heading = (text: string, id = 'Heading1') => paragraph(run(text), style(id));
    const result = await read([
      paragraph(`${run('1.', '<w:b/>')}${run('2.3 ')}${run('Split', '<w:i/>')}`, style('Heading2')),
      heading('A.1 Appendix part'),
      heading('IV. Roman'),
      heading('B) Lettered'),
      heading('7\tTabbed'),
      heading('3D models'),
      heading('2024 Results'),
      heading('F-16 Upgrades'),
      paragraph(run('1 Not a heading')),
    ]);
    expect(blocks(result).map((node) => node.content)).toEqual([
      [{ type: 'text', text: 'Split', marks: [{ type: 'italic' }] }],
      [{ type: 'text', text: 'Appendix part' }],
      [{ type: 'text', text: 'Roman' }],
      [{ type: 'text', text: 'Lettered' }],
      [{ type: 'text', text: 'Tabbed' }],
      [{ type: 'text', text: '3D models' }],
      [{ type: 'text', text: '2024 Results' }],
      [{ type: 'text', text: 'F-16 Upgrades' }],
      [{ type: 'text', text: '1 Not a heading' }],
    ]);
    expect(codes(result)).toContain('not-imported heading-number-removed 5');
  });

  it('DOCE-IMPORT-2.12 takes off bare numbers before a space only where the headings count up from 1', async () => {
    const heading = (text: string, id = 'Heading1') => paragraph(run(text), style(id));
    const counted = await read([
      heading('1 Scope'),
      heading('1.1 Details', 'Heading2'),
      heading('2 Conclusion'),
    ]);
    expect(blocks(counted).map(textOf)).toEqual(['Scope', 'Details', 'Conclusion']);
    const continued = await read([heading('1 Scope'), heading('1.1 Details', 'Heading2')]);
    expect(blocks(continued).map(textOf)).toEqual(['Scope', 'Details']);
    const alone = await read([heading('1 Scope'), heading('Details', 'Heading2')]);
    expect(blocks(alone).map(textOf)).toEqual(['1 Scope', 'Details']);
    const fleet = await read([heading('100 Hour Inspection'), heading('747 Fleet Data')]);
    expect(blocks(fleet).map(textOf)).toEqual(['100 Hour Inspection', '747 Fleet Data']);
  });

  it('DOCE-IMPORT-2.2 reads headings deeper than six levels at the sixth, and titles only in the body', async () => {
    const result = await read([
      paragraph(run('Deep'), style('Heading8')),
      paragraph(run('Outlined'), style('Deep')),
      paragraph(run('Body text level'), '<w:outlineLvl w:val="9"/>'),
      paragraph(run('The title'), style('Title')),
      paragraph('', style('Title')),
      `<w:tbl><w:tblGrid><w:gridCol w:w="1500"/></w:tblGrid><w:tr><w:tc>${paragraph(run('In a cell'), style('Title'))}</w:tc></w:tr></w:tbl>`,
    ]);
    const [deep, outlined, body, title, empty, cells] = blocks(result);
    expect(deep).toEqual({
      type: 'heading',
      attrs: { level: 6 },
      content: [{ type: 'text', text: 'Deep' }],
    });
    expect(outlined?.attrs).toEqual({ level: 6 });
    expect(body?.type).toBe('paragraph');
    expect(title?.attrs).toEqual({ title: true });
    expect(empty).toEqual({ type: 'paragraph' });
    expect(storedBodyOf(cells ?? { type: 'table' })[0]?.content?.[0]?.content?.[0]?.type).toBe(
      'paragraph',
    );
    expect(result.title).toBe('The title');
    expect(codes(result)).toEqual(
      expect.arrayContaining(['not-imported heading-level-clamped 2', 'applied title-applied 1']),
    );
  });

  it('DOCE-IMPORT-2.13 leaves out tables of contents with their heading and update instructions', async () => {
    const result = await read([
      paragraph(run('Contents'), style('TOCHeading')),
      paragraph(
        `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> TOC \\o "1-3" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${run('Scope\t1')}`,
        style('TOC1'),
      ),
      paragraph(`${run('Details\t2')}<w:r><w:fldChar w:fldCharType="end"/></w:r>`, style('TOC1')),
      paragraph(run('Right-click to update the table of contents.')),
      paragraph(run('A table of contents lists the headings.')),
      paragraph(run('Table of Contents')),
      paragraph(run('Scope\t1'), style('MyToc')),
      `<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/></w:docPartObj></w:sdtPr><w:sdtContent>${paragraph(run('Inside'))}</w:sdtContent></w:sdt>`,
      paragraph(run('Body')),
    ]);
    expect(summary(result)).toEqual([
      'paragraph:A table of contents lists the headings.',
      'paragraph:Body',
    ]);
    expect(codes(result)).toContain('skipped contents-skipped 2');
  });

  it('DOCE-IMPORT-2.7 accepts tracked changes and leaves comments out by default', async () => {
    const result = await readDocx(
      buildDocx({
        comments: `<w:comment w:id="0" w:author="Ann">${paragraph(run('Why?'))}</w:comment>`,
        body: paragraph(
          `<w:commentRangeStart w:id="0"/>${run('Keep ')}<w:ins w:id="1" w:author="Ann">${run('new')}</w:ins><w:del w:id="2" w:author="Ben"><w:r><w:delText>old</w:delText></w:r></w:del><w:moveFrom w:id="3">${run(' gone')}</w:moveFrom><w:commentRangeEnd w:id="0"/>`,
        ),
      }),
    );
    if (!result.ok) throw new Error(result.message);
    expect(result.file.sections[0]?.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'Keep new' }] },
    ]);
    expect(result.comments).toEqual([]);
    expect(result.warnings.map(({ code, detail, count }) => [code, detail, count])).toEqual([
      ['review-left-out', 'comment', 1],
      ['review-left-out', 'tracked change', 3],
    ]);
  });

  it('DOCE-IMPORT-2.8 keeps a text box as its text and shows a placeholder for a chart without a picture', async () => {
    const result = await read([
      paragraph(
        `${run('Note: ')}<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:txbx><w:txbxContent>${paragraph(run('Boxed'))}${paragraph(run('text'))}</w:txbxContent></wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice></mc:AlternateContent></w:r>`,
      ),
      paragraph(
        '<w:r><w:drawing><wp:anchor><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"/></a:graphic></wp:anchor></w:drawing></w:r>',
      ),
      paragraph(
        `<w:r><mc:AlternateContent><mc:Choice Requires="cx"><w:drawing><wp:anchor><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/drawing/2014/chartex"/></a:graphic></wp:anchor></w:drawing></mc:Choice><mc:Fallback>${PICTURE.slice('<w:r>'.length, -'</w:r>'.length)}</mc:Fallback></mc:AlternateContent></w:r>`,
      ),
    ]);
    const [box, chart, fallback] = blocks(result);
    expect(box?.content).toEqual([
      { type: 'text', text: 'Note: Boxed' },
      { type: 'lineBreak' },
      { type: 'text', text: 'text' },
    ]);
    expect(chart?.content).toEqual([{ type: 'text', text: '[chart]' }]);
    expect(fallback?.type).toBe('figure');
  });

  it('DOCE-IMPORT-2.4 drops bold in header cells, which the template table style sets', async () => {
    const result = await read([
      `<w:tbl><w:tblGrid><w:gridCol w:w="1500"/></w:tblGrid><w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc>${paragraph(run('Head', '<w:b/><w:i/>'))}</w:tc></w:tr><w:tr><w:tc>${paragraph(run('Body', '<w:b/>'))}</w:tc></w:tr></w:tbl>`,
    ]);
    const [head, body] = storedBodyOf(blocks(result)[0] ?? { type: 'table' });
    expect(head?.content?.[0]?.content?.[0]?.content).toEqual([
      { type: 'text', text: 'Head', marks: [{ type: 'italic' }] },
    ]);
    expect(body?.content?.[0]?.content?.[0]?.content).toEqual([
      { type: 'text', text: 'Body', marks: [{ type: 'bold' }] },
    ]);
  });

  it('DOCE-IMPORT-1.3 counts headings, tables, images and footnotes and reports what the template applies', async () => {
    const result = await read([
      paragraph(run('Report'), style('Title')),
      paragraph(run('One'), style('Heading1')),
      paragraph(run('Two'), style('Heading2')),
      table(),
      figure,
      paragraph(`${run('Inline ')}${PICTURE}`),
    ]);
    expect(result.counts).toEqual({ headings: 2, tables: 1, images: 2, footnotes: 0 });
    expect(result.title).toBe('Report');
    expect(codes(result)).toEqual(['applied title-applied 1', 'applied table-style-applied 1']);
  });

  it('DOCE-IMPORT-2.15 moves the appendices into their own section, from the first appendix heading', async () => {
    const body = (heading: string) => [
      paragraph(run('Scope'), style('Heading1')),
      paragraph(run('Text')),
      paragraph('<w:r><w:br w:type="page"/></w:r>'),
      blank,
      heading,
      paragraph(run('Details')),
      paragraph(run('Annex B Extra'), style('Heading1')),
    ];
    const styled = await read(body(paragraph(run('Tools'), style('AppendixHeading'))), {
      appendixSection: 'annexes',
    });
    expect(
      styled.file.sections.map((section) => [section.name ?? null, section.content.map(textOf)]),
    ).toEqual([
      [null, ['Scope', 'Text']],
      ['annexes', ['Tools', 'Details', 'Annex B Extra']],
    ]);
    expect(styled.pages).toHaveLength(2);
    const labelled = await read(body(paragraph(run('Appendix A Tools'), style('Heading1'))), {
      appendixSection: 'annexes',
    });
    expect(labelled.file.sections[1]?.content.map(textOf)).toEqual([
      'Appendix A Tools',
      'Details',
      'Annex B Extra',
    ]);
    const kept = await read(body(paragraph(run('Appendix A Tools'), style('Heading1'))));
    expect(kept.file.sections).toHaveLength(1);
  });
});
