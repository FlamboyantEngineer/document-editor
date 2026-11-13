// A stored document as a word processing document (Office Open XML): its headings in the heading
// styles, paragraphs and their formats, lists, quotes, code, math as its source, tables, page
// breaks, links and footnotes, in the template's page size and margins, its suggestions accepted
// or rejected. Figures are written as their alternative text and caption.

import { safeHref } from '../schema/dom-attributes.js';
import { PAGE_SIZE_DIMENSIONS } from '../templates/template-css-values.js';
import {
  type DocumentFile,
  type StoredMark,
  storedMathSource,
  type StoredNode,
} from './document-format.js';
import type { TemplateFile } from './template-format.js';
import { writeZip } from './zip.js';

/** How `writeDocx` writes a document. */
export interface DocxOptions {
  /** The resolved template, whose page size, orientation and margins the document takes. */
  readonly template?: TemplateFile | undefined;
  /** Whether the suggestions are written as if accepted (the default) or rejected. */
  readonly suggestions?: 'accepted' | 'rejected' | undefined;
}

interface Writing {
  readonly suggestions: 'accepted' | 'rejected';
  readonly footnotes: string[];
  readonly links: string[];
}

const xml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const text = (value: unknown) => (typeof value === 'string' ? value : '');

const RUN_PROPERTIES: Readonly<Record<string, string>> = {
  bold: '<w:b/>',
  italic: '<w:i/>',
  underline: '<w:u w:val="single"/>',
  strike: '<w:strike/>',
  superscript: '<w:vertAlign w:val="superscript"/>',
  subscript: '<w:vertAlign w:val="subscript"/>',
  code: '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>',
};

function leftOut(marks: readonly StoredMark[] | undefined, writing: Writing): boolean {
  const out = writing.suggestions === 'accepted' ? 'deletion' : 'insertion';
  return (marks ?? []).some((mark) => mark.type === out);
}

const run = (value: string, properties = '') =>
  `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ''}<w:t xml:space="preserve">${xml(value)}</w:t></w:r>`;

// A text node's run, in a hyperlink when it links.
function textRun(node: StoredNode, writing: Writing): string {
  const marks = node.marks ?? [];
  const properties = marks.map((mark) => RUN_PROPERTIES[mark.type] ?? '').join('');
  // A link with an address a link may not hold is written as its text.
  const href = safeHref(marks.find((mark) => mark.type === 'link')?.attrs?.href);
  if (href === null) return run(text(node.text), properties);
  writing.links.push(href);
  const id = `rIdLink${String(writing.links.length)}`;
  return `<w:hyperlink r:id="${id}">${run(text(node.text), `<w:rStyle w:val="Hyperlink"/>${properties}`)}</w:hyperlink>`;
}

function inlineOf(node: StoredNode, writing: Writing): string {
  if (leftOut(node.marks, writing)) return '';
  switch (node.type) {
    case 'text':
      return textRun(node, writing);
    case 'lineBreak':
      return '<w:r><w:br/></w:r>';
    case 'math':
      return run(storedMathSource(node), '<w:i/>');
    case 'footnote': {
      writing.footnotes.push(inlines(node.content, writing));
      const id = String(writing.footnotes.length);
      return `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${id}"/></w:r>`;
    }
    case 'abbreviation': {
      const { abbreviation, expansion, display } = node.attrs ?? {};
      const shown =
        display === 'short' ? text(abbreviation) : `${text(expansion)} (${text(abbreviation)})`;
      return run(shown);
    }
    case 'mention':
      return run(`@${text(node.attrs?.label)}`);
    default:
      return inlines(node.content, writing);
  }
}

const inlineText = (content: readonly StoredNode[] | undefined) =>
  (content ?? []).map((node) => text(node.text)).join('');

const inlines = (content: readonly StoredNode[] | undefined, writing: Writing) =>
  (content ?? []).map((node) => inlineOf(node, writing)).join('');

const paragraph = (runs: string, properties = '') =>
  `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ''}${runs}</w:p>`;

const styled = (style: string, extra = '') => `<w:pStyle w:val="${style}"/>${extra}`;

// A list's items, each a paragraph led by its bullet or number, indented by its depth.
function listOf(node: StoredNode, writing: Writing, depth: number): string {
  const ordered = node.type === 'orderedList';
  const start = typeof node.attrs?.start === 'number' ? node.attrs.start : 1;
  return (node.content ?? [])
    .map((item, index) => {
      const marker = ordered ? `${String(start + index)}.` : '•';
      const indent = `<w:ind w:left="${String(360 * (depth + 1))}" w:hanging="360"/>`;
      return (item.content ?? [])
        .map((child, childIndex) => {
          if (child.type === 'bulletList' || child.type === 'orderedList') {
            return listOf(child, writing, depth + 1);
          }
          const lead = childIndex === 0 ? run(`${marker}\t`) : '';
          return paragraph(lead + inlines(child.content, writing), styled('ListParagraph', indent));
        })
        .join('');
    })
    .join('');
}

function tableOf(node: StoredNode, writing: Writing): string {
  const rows = node.content ?? [];
  const width = Math.max(1, ...rows.map((row) => row.content?.length ?? 0));
  const border = (side: string) =>
    `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`;
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('');
  const caption = text(node.attrs?.caption);
  const cells = (row: StoredNode, header: boolean) =>
    (row.content ?? [])
      .map((cell) => {
        const body = blocks(cell.content, writing) || paragraph('');
        // A header cell's paragraphs take the bold header style.
        const shown = header
          ? body.replace(/<w:p>(?!<w:pPr>)/g, '<w:p><w:pPr><w:pStyle w:val="TableHeader"/></w:pPr>')
          : body;
        return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${shown}</w:tc>`;
      })
      .join('');
  return [
    caption ? paragraph(run(caption), styled('Caption')) : '',
    `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr>`,
    `<w:tblGrid>${'<w:gridCol/>'.repeat(width)}</w:tblGrid>`,
    ...rows.map(
      (row, index) =>
        `<w:tr>${cells(row, index === 0 && row.content?.[0]?.type === 'tableHeader')}</w:tr>`,
    ),
    '</w:tbl>',
  ].join('');
}

const code = (value: string) =>
  value
    .split('\n')
    .map((line) => paragraph(run(line), styled('Code')))
    .join('');

const BLOCKS: Readonly<Record<string, (node: StoredNode, writing: Writing) => string>> = {
  paragraph: (node, writing) => paragraph(inlines(node.content, writing)),
  heading: (node, writing) => {
    const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1));
    return paragraph(inlines(node.content, writing), styled(`Heading${String(level)}`));
  },
  bulletList: (node, writing) => listOf(node, writing, 0),
  orderedList: (node, writing) => listOf(node, writing, 0),
  blockquote: (node, writing) =>
    blocks(node.content, writing).replace(/<w:p>(<w:pPr>)?/g, (_, has: string | undefined) =>
      has
        ? '<w:p><w:pPr><w:pStyle w:val="Quote"/>'
        : '<w:p><w:pPr><w:pStyle w:val="Quote"/></w:pPr>',
    ),
  codeBlock: (node) => code(inlineText(node.content)),
  linkedCode: (node) => code(text(node.attrs?.code)),
  mathBlock: (node) => paragraph(run(storedMathSource(node), '<w:i/>'), '<w:jc w:val="center"/>'),
  table: tableOf,
  figure: (node) => {
    const { alt, caption } = node.attrs ?? {};
    return [
      paragraph(run(`[${text(alt) || 'figure'}]`), '<w:jc w:val="center"/>'),
      text(caption) ? paragraph(run(text(caption)), styled('Caption')) : '',
    ].join('');
  },
  pageBreak: () => '<w:p><w:r><w:br w:type="page"/></w:r></w:p>',
  rule: () =>
    paragraph(
      '',
      '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr>',
    ),
  contents: () => '',
};

function blocks(content: readonly StoredNode[] | undefined, writing: Writing): string {
  return (content ?? [])
    .map((node) => {
      const write = BLOCKS[node.type];
      return write ? write(node, writing) : blocks(node.content, writing);
    })
    .join('');
}

// Twentieths of a point from a CSS length; null for one it does not read.
function twips(value: unknown): number | null {
  const match = /^(-?\d+(?:\.\d+)?)(pt|px|mm|cm|in)$/.exec(text(value).trim());
  if (!match) return null;
  const amount = Number(match[1]);
  const per = { pt: 20, px: 15, mm: 1440 / 25.4, cm: 1440 / 2.54, in: 1440 }[
    match[2] as 'pt' | 'px' | 'mm' | 'cm' | 'in'
  ];
  return Math.round(amount * per);
}

// The section properties: the template's page size, orientation and margins.
function sectionProperties(template: TemplateFile | undefined): string {
  const page = template?.page;
  const size = PAGE_SIZE_DIMENSIONS[page?.size ?? 'A4'] ?? PAGE_SIZE_DIMENSIONS.A4;
  const landscape = page?.orientation === 'landscape';
  const across = twips(size?.width) ?? 11906;
  const down = twips(size?.height) ?? 16838;
  const width = landscape ? down : across;
  const height = landscape ? across : down;
  const margin = (side: 'top' | 'right' | 'bottom' | 'left') =>
    twips(page?.margins?.[side]) ?? 1440;
  return [
    '<w:sectPr>',
    `<w:pgSz w:w="${String(width)}" w:h="${String(height)}"${landscape ? ' w:orient="landscape"' : ''}/>`,
    `<w:pgMar w:top="${String(margin('top'))}" w:right="${String(margin('right'))}" w:bottom="${String(margin('bottom'))}" w:left="${String(margin('left'))}" w:header="720" w:footer="720" w:gutter="0"/>`,
    '</w:sectPr>',
  ].join('');
}

const NAMESPACES =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const STYLES = [
  HEADER,
  `<w:styles ${NAMESPACES}>`,
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>',
  ...[1, 2, 3, 4, 5, 6].map(
    (level) =>
      `<w:style w:type="paragraph" w:styleId="Heading${String(level)}"><w:name w:val="heading ${String(level)}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:outlineLvl w:val="${String(level - 1)}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${String(36 - level * 3)}"/></w:rPr></w:style>`,
  ),
  '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/></w:style>',
  '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>',
  '<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="20"/></w:rPr></w:style>',
  '<w:style w:type="paragraph" w:styleId="TableHeader"><w:name w:val="Table Header"/><w:basedOn w:val="Normal"/><w:rPr><w:b/></w:rPr></w:style>',
  '<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:rPr><w:i/><w:sz w:val="18"/></w:rPr></w:style>',
  '<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="18"/></w:rPr></w:style>',
  '<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>',
  '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>',
  '</w:styles>',
].join('');

function footnotesPart(footnotes: readonly string[]): string {
  const separator = (id: string, type: string, mark: string) =>
    `<w:footnote w:type="${type}" w:id="${id}"><w:p><w:r><w:${mark}/></w:r></w:p></w:footnote>`;
  return [
    HEADER,
    `<w:footnotes ${NAMESPACES}>`,
    separator('-1', 'separator', 'separator'),
    separator('0', 'continuationSeparator', 'continuationSeparator'),
    ...footnotes.map(
      (runs, index) =>
        `<w:footnote w:id="${String(index + 1)}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>${run(' ')}${runs}</w:p></w:footnote>`,
    ),
    '</w:footnotes>',
  ].join('');
}

const RELATIONSHIP = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function documentRelationships(links: readonly string[]): string {
  return [
    HEADER,
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    `<Relationship Id="rIdStyles" Type="${RELATIONSHIP}/styles" Target="styles.xml"/>`,
    `<Relationship Id="rIdFootnotes" Type="${RELATIONSHIP}/footnotes" Target="footnotes.xml"/>`,
    ...links.map(
      (href, index) =>
        `<Relationship Id="rIdLink${String(index + 1)}" Type="${RELATIONSHIP}/hyperlink" Target="${xml(href)}" TargetMode="External"/>`,
    ),
    '</Relationships>',
  ].join('');
}

const CONTENT_TYPES = [
  HEADER,
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
  '<Default Extension="xml" ContentType="application/xml"/>',
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
  '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>',
  '</Types>',
].join('');

const PACKAGE_RELATIONSHIPS = [
  HEADER,
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
  `<Relationship Id="rId1" Type="${RELATIONSHIP}/officeDocument" Target="word/document.xml"/>`,
  '</Relationships>',
].join('');

/** A stored document as the bytes of a word processing document (`.docx`). */
export function writeDocx(file: DocumentFile, options: DocxOptions = {}): Uint8Array {
  const writing: Writing = {
    suggestions: options.suggestions ?? 'accepted',
    footnotes: [],
    links: [],
  };
  const body = file.sections.map((section) => blocks(section.content, writing)).join('');
  const document = `${HEADER}<w:document ${NAMESPACES}><w:body>${body}${sectionProperties(options.template)}</w:body></w:document>`;
  return writeZip([
    { path: '[Content_Types].xml', data: CONTENT_TYPES },
    { path: '_rels/.rels', data: PACKAGE_RELATIONSHIPS },
    { path: 'word/document.xml', data: document },
    { path: 'word/styles.xml', data: STYLES },
    { path: 'word/footnotes.xml', data: footnotesPart(writing.footnotes) },
    { path: 'word/_rels/document.xml.rels', data: documentRelationships(writing.links) },
  ]);
}
