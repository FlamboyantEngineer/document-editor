// Generic word processing documents, one per feature the import contract covers, built by
// `buildDocx`. The text is sample text about gardens and weather stations; it means nothing.

import { A4, type DocxFixture, paragraph, run, section, style } from './build-docx-fixture.js';

const styleDef = (id: string, name: string, extra = '') =>
  `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>${extra}</w:style>`;

/** Styles: headings by id and by name, a title, levels, custom styles, quotes, code, run formats. */
export const STYLES: DocxFixture = {
  styles: [
    styleDef('Normal', 'Normal'),
    styleDef('Title', 'Title'),
    styleDef('Heading1', 'heading 1'),
    styleDef('Kop2', 'heading 2'),
    styleDef('Outlined', 'Outlined', '<w:pPr><w:outlineLvl w:val="2"/></w:pPr>'),
    styleDef('ParagraphLevel3', 'Paragraph Level 3'),
    styleDef('Custom_lead', 'lead'),
    styleDef('Custom_aside', 'aside'),
    styleDef('Fancy', 'Fancy', '<w:basedOn w:val="Normal"/>'),
    styleDef('Quote', 'Quote'),
    styleDef('Code', 'Code'),
  ].join(''),
  links: { rIdLink1: 'https://example.test/beds' },
  body: [
    paragraph(run('Garden notes'), style('Title')),
    paragraph(run('Beds'), style('Heading1')),
    paragraph(run('North bed'), style('Kop2')),
    paragraph(run('Soil'), style('Outlined')),
    paragraph(run('A third-level paragraph.'), style('ParagraphLevel3')),
    paragraph(run('A lead paragraph.'), style('Custom_lead')),
    paragraph(run('A custom heading.'), `${style('Custom_lead')}<w:outlineLvl w:val="1"/>`),
    paragraph(run('An aside.'), style('Custom_aside')),
    paragraph(run('A fancy paragraph.'), style('Fancy')),
    paragraph(run('Quoted once.'), style('Quote')),
    paragraph(run('Quoted twice.'), style('Quote')),
    paragraph(`${run('let rows = 4;')}<w:r><w:br/></w:r>${run('plant(rows);')}`, style('Code')),
    paragraph(
      [
        run('bold', '<w:b/>'),
        run(' italic', '<w:i/>'),
        run(' under', '<w:u w:val="single"/>'),
        run(' struck', '<w:strike/>'),
        run('2', '<w:vertAlign w:val="superscript"/>'),
        run(' code', '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>'),
        run(' red', '<w:color w:val="FF0000"/>'),
        run(' plain', '<w:b w:val="0"/>'),
        `<w:hyperlink r:id="rIdLink1">${run('the beds', '<w:rStyle w:val="Hyperlink"/>')}</w:hyperlink>`,
      ].join(''),
    ),
    paragraph(`${run('Before the break.')}<w:r><w:br w:type="page"/></w:r>${run('After it.')}`),
    paragraph(
      [
        run('Page '),
        '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>',
        run('3'),
        '<w:r><w:fldChar w:fldCharType="end"/></w:r>',
        run(' on '),
        '<w:fldSimple w:instr=" DATE "><w:r><w:t>1 May</w:t></w:r></w:fldSimple>',
        run(' for '),
        '<w:sdt><w:sdtPr><w:tag w:val="variable:station.name"/></w:sdtPr><w:sdtContent>',
        run('North'),
        '</w:sdtContent></w:sdt>',
      ].join(''),
    ),
    paragraph('<m:oMathPara><m:oMath><m:r><m:t>x=2</m:t></m:r></m:oMath></m:oMathPara>'),
    A4,
  ].join(''),
};

const level = (ilvl: number, format: string, start = 1) =>
  `<w:lvl w:ilvl="${String(ilvl)}"><w:start w:val="${String(start)}"/><w:numFmt w:val="${format}"/></w:lvl>`;
const numbered = (numId: string, ilvl = 0) =>
  `<w:numPr><w:ilvl w:val="${String(ilvl)}"/><w:numId w:val="${numId}"/></w:numPr>`;

/** Numbering: bulleted and numbered lists, nesting, a start override, paragraph and heading numbering. */
export const NUMBERING: DocxFixture = {
  styles: [
    styleDef('Heading1', 'heading 1'),
    styleDef('ListBullet', 'List Bullet', `<w:pPr>${numbered('1')}</w:pPr>`),
  ].join(''),
  numbering: [
    `<w:abstractNum w:abstractNumId="0"><w:name w:val="Bullets"/>${level(0, 'bullet')}${level(1, 'bullet')}</w:abstractNum>`,
    `<w:abstractNum w:abstractNumId="1"><w:name w:val="Numbers"/>${level(0, 'decimal')}${level(1, 'lowerLetter')}</w:abstractNum>`,
    `<w:abstractNum w:abstractNumId="2"><w:name w:val="Paragraphs"/>${level(0, 'none')}${level(1, 'decimal')}</w:abstractNum>`,
    `<w:abstractNum w:abstractNumId="3"><w:name w:val="Headings"/>${level(0, 'decimal')}</w:abstractNum>`,
    '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>',
    '<w:num w:numId="2"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="3"/></w:lvlOverride></w:num>',
    '<w:num w:numId="3"><w:abstractNumId w:val="2"/></w:num>',
    '<w:num w:numId="4"><w:abstractNumId w:val="3"/></w:num>',
  ].join(''),
  body: [
    paragraph(run('Tools'), `${style('Heading1')}${numbered('4')}`),
    paragraph(run('Spade'), numbered('1')),
    paragraph(run('Blade'), numbered('1', 1)),
    paragraph(run('Fork'), style('ListBullet')),
    paragraph(run('Third'), numbered('2')),
    paragraph(run('Fourth'), numbered('2')),
    paragraph(run('Nested letter'), numbered('2', 1)),
    paragraph(run('A numbered paragraph.'), numbered('3', 1)),
    A4,
  ].join(''),
};

/** Sections: an A5 cover and an A4 landscape body, with headers and footers and their page fields. */
export const SECTIONS: DocxFixture = {
  settings: `<w:docVars><w:docVar w:name="sections" w:val='["cover",""]'/></w:docVars>`,
  regions: {
    header1: paragraph(run('Station log')),
    footer1: paragraph(
      `${run('Page ')}<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>${run(' of ')}<w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>2</w:t></w:r></w:fldSimple>`,
    ),
  },
  body: [
    paragraph(run('Cover')),
    paragraph(
      '',
      section(
        8391,
        11906,
        '<w:headerReference w:type="default" r:id="rIdheader1"/><w:footerReference w:type="default" r:id="rIdfooter1"/>',
      ),
    ),
    paragraph(run('Body text.')),
    section(16838, 11906),
  ].join(''),
};

/** Footnotes and endnotes, with formatted text and two paragraphs. */
export const NOTES: DocxFixture = {
  footnotes: [
    '<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>',
    `<w:footnote w:id="1"><w:p><w:r><w:footnoteRef/></w:r>${run(' Measured at ')}${run('noon', '<w:i/>')}</w:p>${paragraph(run('Second line.'))}</w:footnote>`,
  ].join(''),
  endnotes: `<w:endnote w:id="1">${paragraph(run('An endnote.'))}</w:endnote>`,
  body: [
    paragraph(
      `${run('Rain fell')}<w:r><w:footnoteReference w:id="1"/></w:r>${run(' twice')}<w:r><w:endnoteReference w:id="1"/></w:r>${run('.')}`,
    ),
    A4,
  ].join(''),
};

/** Comments: a resolved thread with a reply, an open thread, and tracked changes. */
export const COMMENTS: DocxFixture = {
  comments: [
    `<w:comment w:id="0" w:author="Ada" w:date="2026-01-02T10:00:00Z"><w:p w14:paraId="00000A01">${run('Check this.')}</w:p></w:comment>`,
    `<w:comment w:id="1" w:author="Ben" w:date="2026-01-02T11:00:00Z"><w:p w14:paraId="00000A02">${run('Done.')}</w:p></w:comment>`,
    `<w:comment w:id="2" w:author="Ada"><w:p w14:paraId="00000A03">${run('Still open.')}</w:p></w:comment>`,
  ].join(''),
  commentsExtended: [
    '<w15:commentEx w15:paraId="00000A01" w15:done="1"/>',
    '<w15:commentEx w15:paraId="00000A02" w15:paraIdParent="00000A01" w15:done="0"/>',
    '<w15:commentEx w15:paraId="00000A03" w15:done="0"/>',
  ].join(''),
  body: [
    paragraph(
      [
        run('A '),
        '<w:commentRangeStart w:id="0"/><w:commentRangeStart w:id="1"/>',
        run('checked'),
        '<w:commentRangeEnd w:id="0"/><w:commentRangeEnd w:id="1"/>',
        run(' and '),
        '<w:commentRangeStart w:id="2"/>',
      ].join(''),
    ),
    paragraph(`${run('open')}<w:commentRangeEnd w:id="2"/>${run(' range.')}`),
    paragraph(
      `${run('Keep ')}<w:ins w:id="5" w:author="Ada">${run('new')}</w:ins><w:del w:id="6" w:author="Ada"><w:r><w:delText>old</w:delText></w:r></w:del>${run('.')}`,
    ),
    A4,
  ].join(''),
};

const cell = (text: string, properties = '') =>
  `<w:tc>${properties ? `<w:tcPr>${properties}</w:tcPr>` : ''}${paragraph(run(text))}</w:tc>`;

/** Tables: grid widths, a header row, spanned columns and rows, shading, a caption and a nested table. */
export const TABLES: DocxFixture = {
  styles: styleDef('Caption', 'caption'),
  body: [
    paragraph(
      `<w:r><w:rPr><w:rStyle w:val="CaptionLabel"/></w:rPr><w:t xml:space="preserve">Table 1 - </w:t></w:r>${run('Rainfall')}`,
      style('Caption'),
    ),
    '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="1500"/><w:gridCol w:w="3000"/><w:gridCol w:w="1500"/></w:tblGrid>',
    `<w:tr><w:trPr><w:tblHeader/></w:trPr>${cell('Day')}${cell('Rain', '<w:gridSpan w:val="2"/>')}</w:tr>`,
    `<w:tr>${cell('Mon', '<w:vMerge w:val="restart"/><w:vAlign w:val="bottom"/>')}${cell('4')}${cell('Wet', '<w:shd w:val="clear" w:fill="FFEE00"/>')}</w:tr>`,
    `<w:tr>${cell('', '<w:vMerge/>')}${cell('5')}<w:tc><w:tbl><w:tblGrid><w:gridCol w:w="750"/></w:tblGrid><w:tr>${cell('Inner')}</w:tr></w:tbl><w:p/></w:tc></w:tr>`,
    '</w:tbl>',
    A4,
  ].join(''),
};

const drawing = (id: string, name: string, size = '<wp:extent cx="952500" cy="476250"/>') =>
  `<w:r><w:drawing><wp:inline>${size}<wp:docPr id="1" name="${name}" descr="${name}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:blipFill><a:blip r:embed="${id}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

/** Images: an inline image, a figure with a caption after it, a linked image, a chart and a text box. */
export const IMAGES: DocxFixture = {
  styles: styleDef('Caption', 'caption'),
  media: { 'plot.png': new Uint8Array([137, 80, 78, 71]), 'old.emf': new Uint8Array([1, 2]) },
  body: [
    paragraph(`${run('An icon ')}${drawing('rIdplot', 'icon')}${run(' in text.')}`),
    paragraph(drawing('rIdplot', 'Plot plan')),
    paragraph(run('Plot plan of the beds'), style('Caption')),
    paragraph(drawing('rIdold', 'Old format')),
    paragraph(
      '<w:r><w:drawing><wp:inline><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:blipFill><a:blip r:link="rIdLinked"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>',
    ),
    paragraph(
      '<w:r><w:drawing><wp:anchor><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"/></a:graphic></wp:anchor></w:drawing></w:r>',
    ),
    A4,
  ].join(''),
};

/** What the library's writer adds: code captions, rules, list paragraphs, section-only paragraphs. */
export const WRITER_SHAPES: DocxFixture = {
  styles: [
    styleDef('Code', 'Code'),
    styleDef('Caption', 'caption'),
    styleDef('ListParagraph', 'List Paragraph'),
  ].join(''),
  numbering: [
    `<w:abstractNum w:abstractNumId="0"><w:name w:val="Bullets"/>${level(0, 'bullet')}${level(1, 'bullet')}</w:abstractNum>`,
    '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>',
  ].join(''),
  body: [
    paragraph(run('let rain = 1;'), style('Code')),
    paragraph(run('Below the code'), style('Caption')),
    paragraph(run('Above the code'), style('Caption')),
    paragraph(run('let sun = 2;'), style('Code')),
    paragraph(
      '',
      '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr>',
    ),
    paragraph('', '<w:pBdr><w:top w:val="single"/><w:bottom w:val="single"/></w:pBdr>'),
    paragraph(run('Plant'), `${style('ListParagraph')}${numbered('1')}`),
    paragraph(run('Water it daily.'), style('ListParagraph')),
    paragraph(run('Prune'), `${style('ListParagraph')}${numbered('1', 1)}`),
    paragraph(run('Only in spring.'), style('ListParagraph')),
    paragraph(run('After the list.')),
    paragraph(run('Not in a list.'), style('ListParagraph')),
    paragraph('', section(11906, 16838)),
    paragraph('', section(11906, 16838)),
    paragraph(run('Last section.')),
    A4,
  ].join(''),
};
