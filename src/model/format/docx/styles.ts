// The styles part: the template's styles as Word's paragraph and character styles, by the ids the
// writer and the reader share (FORMAT §5): Normal, Title, Heading1 to Heading6, ParagraphLevel2 to
// ParagraphLevel6, the block styles, and each custom style as `Custom_<key>`.

import type { TemplateFile, TextSettings } from '../template-format.js';
import { type ParagraphExtras, paragraphProperties, runProperties } from './word-properties.js';
import { escapeXml, WORD_NAMESPACES, XML_DECLARATION } from './word-xml.js';

/** What a paragraph style is: its id, name and parent, and what it sets. */
interface ParagraphStyle {
  readonly id: string;
  readonly name: string;
  readonly text?: TextSettings | null | undefined;
  readonly extras?: ParagraphExtras | undefined;
  readonly basedOn?: string | null | undefined;
  readonly next?: string | undefined;
  readonly isDefault?: boolean | undefined;
}

/** The style a custom style key is written as. */
export function customStyleId(key: string): string {
  return `Custom_${key}`;
}

/** The style a paragraph level is written as: Normal at level 1, ParagraphLevelN below it. */
export function paragraphLevelStyleId(level: number): string {
  return level > 1 ? `ParagraphLevel${String(level)}` : 'Normal';
}

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

function paragraphStyle(style: ParagraphStyle): string {
  const paragraph = paragraphProperties(style.text, style.extras);
  const run = runProperties(style.text);
  return [
    `<w:style w:type="paragraph"${style.isDefault ? ' w:default="1"' : ''} w:styleId="${escapeXml(style.id)}">`,
    `<w:name w:val="${escapeXml(style.name)}"/>`,
    style.basedOn === null ? '' : `<w:basedOn w:val="${style.basedOn ?? 'Normal'}"/>`,
    style.next ? `<w:next w:val="${style.next}"/>` : '',
    '<w:qFormat/>',
    paragraph ? `<w:pPr>${paragraph}</w:pPr>` : '',
    run ? `<w:rPr>${run}</w:rPr>` : '',
    '</w:style>',
  ].join('');
}

const characterStyle = (id: string, name: string, run: string) =>
  `<w:style w:type="character" w:styleId="${id}"><w:name w:val="${name}"/>${run ? `<w:rPr>${run}</w:rPr>` : ''}</w:style>`;

// The paragraph levels below the first, indented as the editor indents them unless a level sets
// where its text starts.
function levelStyles(template: TemplateFile): ParagraphStyle[] {
  const levels = template.styles?.paragraph?.numbering?.levels ?? [];
  return [2, 3, 4, 5, 6].map((level) => ({
    id: paragraphLevelStyleId(level),
    name: `Paragraph Level ${String(level)}`,
    extras: { indent: levels[level - 1]?.textIndent ?? `${String((level - 1) * 20)}pt` },
  }));
}

function blockStyles(template: TemplateFile): ParagraphStyle[] {
  const styles = template.styles ?? {};
  const list = styles.list;
  const header = styles.table?.header;
  const footnoteText = template.footnotes?.text;
  return [
    {
      id: 'ListParagraph',
      name: 'List Paragraph',
      text: { spaceBefore: list?.spaceBefore, spaceAfter: list?.spaceAfter },
    },
    { id: 'Quote', name: 'Quote', text: { italic: true }, extras: { indent: '36pt' } },
    {
      id: 'Code',
      name: 'Code',
      text: styles.codeBlock,
      extras: { shading: styles.codeBlock?.background },
    },
    { id: 'Caption', name: 'caption', text: styles.figure?.caption?.text },
    {
      id: 'TableHeader',
      name: 'Table Header',
      text: { color: header?.color, weight: header?.weight ?? 700 },
    },
    { id: 'FootnoteText', name: 'footnote text', text: { size: '9pt', ...footnoteText } },
    { id: 'Header', name: 'header' },
    { id: 'Footer', name: 'footer' },
    { id: 'CommentText', name: 'annotation text' },
  ];
}

/** The styles part of a document written with a resolved template. */
export function writeStylesPart(template: TemplateFile): string {
  const styles = template.styles ?? {};
  const paragraph = styles.paragraph;
  const footnotes = template.footnotes;
  const paragraphStyles: ParagraphStyle[] = [
    { id: 'Normal', name: 'Normal', text: paragraph, basedOn: null, isDefault: true },
    { id: 'Title', name: 'Title', text: styles.title, next: 'Normal' },
    ...HEADING_LEVELS.map((level) => ({
      id: `Heading${String(level)}`,
      name: `heading ${String(level)}`,
      text: styles[`heading${level}`],
      next: 'Normal',
      extras: { keepNext: true, outlineLevel: level },
    })),
    ...levelStyles(template),
    ...blockStyles(template),
    ...Object.entries(styles.custom ?? {}).map(([key, text]) => ({
      id: customStyleId(key),
      name: key,
      text,
    })),
  ];
  return [
    XML_DECLARATION,
    `<w:styles ${WORD_NAMESPACES}>`,
    ...paragraphStyles.map(paragraphStyle),
    characterStyle(
      'FootnoteReference',
      'footnote reference',
      `${runProperties(footnotes?.marker)}<w:vertAlign w:val="superscript"/>`,
    ),
    characterStyle('CaptionLabel', 'Caption Label', runProperties(styles.figure?.caption?.label)),
    characterStyle('Hyperlink', 'Hyperlink', '<w:color w:val="0563C1"/><w:u w:val="single"/>'),
    characterStyle('CommentReference', 'annotation reference', '<w:sz w:val="16"/>'),
    '</w:styles>',
  ].join('');
}
