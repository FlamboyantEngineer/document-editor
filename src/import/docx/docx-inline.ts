// A paragraph's runs read into stored inline content: text with its bold, italic, underline,
// strike, superscript, subscript and code marks, line and page breaks, tabs and symbols, links,
// tracked insertions and deletions, comment ranges, footnotes, images, fields (`docx-fields.ts`)
// and variables.
// Formatting the stored format keeps in the template, such as fonts, sizes and colours, is left
// out with a warning; so is the result of a field it has no node for, which stays as text.

import type { StoredMark, StoredNode } from '../../model/format/document-format.js';
import type { ImportWarnings } from '../import-warnings.js';
import { joinText, textNode, withMark } from '../stored-inline.js';
import {
  childElement,
  childElements,
  childValue,
  findElement,
  findElements,
  type XmlElement,
} from '../xml-read.js';
import { readDrawing } from './docx-drawing.js';
import {
  CAPTION_LABEL_MARK,
  endField,
  type Field,
  fieldChar,
  fieldMark,
  inHiddenField,
  linkMark,
} from './docx-fields.js';
import type { DocxNumbering } from './docx-numbering.js';
import type { DocxPart } from './docx-package.js';
import type { DocxStyles } from './docx-styles.js';

/** What reading a part needs: the part, the document's styles and notes, and the state that runs on from one paragraph to the next. */
export interface DocxReading {
  readonly part: DocxPart;
  readonly styles: DocxStyles;
  readonly numbering: DocxNumbering;
  readonly warnings: ImportWarnings;
  /** A footnote's or endnote's text as inline content; null when the document has no such note. */
  readonly note: (kind: 'footnote' | 'endnote', id: string) => StoredNode[] | null;
  /** The comment mark of the thread a comment belongs to; null for an unknown comment. */
  readonly commentMark: (id: string) => StoredMark | null;
  /** The suggestion mark of a tracked change (`w:ins`, `w:del`, `w:moveTo`, `w:moveFrom`). */
  readonly changeMark: (kind: 'insertion' | 'deletion', change: XmlElement) => StoredMark;
  /**
   * The comments whose ranges are open, the fields being read, which may span paragraphs, and
   * whether the paragraph being read is part of a table of contents.
   */
  readonly open: { comments: string[]; fields: Field[]; contents?: boolean };
  /** Whether tracked changes and comments are kept as suggestions and comment marks. */
  readonly keepsReview: boolean;
}

const MONOSPACE =
  /^(courier( new)?|consolas|menlo|monaco|lucida console|source code pro|monospace)$/i;

const isOn = (element: XmlElement | null) =>
  !!element && !['0', 'false', 'off', 'none'].includes(element.attrs['w:val'] ?? 'true');

// The run properties that turn a mark on, and the character styles that mean the same.
const TOGGLES: readonly (readonly [string, readonly string[], string | null])[] = [
  ['bold', ['w:b'], 'Strong'],
  ['italic', ['w:i'], 'Emphasis'],
  ['underline', ['w:u'], null],
  ['strike', ['w:strike', 'w:dstrike'], null],
];

// Warnings for the formatting a run sets that the stored format keeps in the template.
function warnFormatting(rPr: XmlElement | null, reading: DocxReading): void {
  const color = childValue(rPr, 'w:color');
  if (color && !/^(auto|000000)$/i.test(color))
    reading.warnings.add('formatting-left-out', 'colour');
  if (childElement(rPr, 'w:highlight') || childElement(rPr, 'w:shd')) {
    reading.warnings.add('formatting-left-out', 'highlight');
  }
  const font = childValue(rPr, 'w:rFonts', 'w:ascii');
  if (font && !MONOSPACE.test(font)) reading.warnings.add('formatting-left-out', 'font');
}

// The marks a run's properties give.
function runMarks(rPr: XmlElement | null, reading: DocxReading): StoredMark[] {
  const style = childValue(rPr, 'w:rStyle');
  const marks: StoredMark[] = TOGGLES.filter(
    ([, names, named]) =>
      names.some((name) => isOn(childElement(rPr, name))) || (!!named && style === named),
  ).map(([type]) => ({ type }));
  const align = childValue(rPr, 'w:vertAlign');
  if (align === 'superscript' || align === 'subscript') marks.push({ type: align });
  const font = childValue(rPr, 'w:rFonts', 'w:ascii');
  if (font && MONOSPACE.test(font)) marks.push({ type: 'code' });
  warnFormatting(rPr, reading);
  return marks;
}

const SYMBOLS: Readonly<Record<string, string>> = {
  'w:tab': '\t',
  'w:noBreakHyphen': '‑',
  'w:softHyphen': '­',
};

type RunChildReader = (
  element: XmlElement,
  reading: DocxReading,
  marks: StoredMark[],
) => StoredNode[];

const text: RunChildReader = (element, reading, marks) =>
  inHiddenField(reading)
    ? []
    : [textNode(element.children.filter((child) => typeof child === 'string').join(''), marks)];

const breakOf: RunChildReader = (element) => {
  if (element.attrs['w:type'] === 'page') return [{ type: 'pageBreak' }];
  return element.attrs['w:type'] === 'column' ? [] : [{ type: 'lineBreak' }];
};

// A symbol by its character code; a code no character has gives nothing.
const symbol: RunChildReader = (element, _reading, marks) => {
  const code = Number.parseInt(element.attrs['w:char'] ?? '', 16);
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff
    ? [textNode(String.fromCodePoint(code), marks)]
    : [];
};

const noteReference: RunChildReader = (element, reading) => {
  const kind = element.name === 'w:footnoteReference' ? 'footnote' : 'endnote';
  const content = reading.note(kind, element.attrs['w:id'] ?? '');
  return content ? [{ type: 'footnote', ...(content.length ? { content } : {}) }] : [];
};

// A drawing: its picture; else a text box's text, its paragraphs parted by line breaks; else a
// placeholder naming what was left out, so the reader sees where it was.
const drawing: RunChildReader = (element, reading) => {
  const shown = readDrawing(element, reading);
  if ('node' in shown) return [shown.node];
  if (shown.kind === 'none') return [];
  const box = findElement(element, 'w:txbxContent');
  if (box) {
    return childElements(box, 'w:p').flatMap((p, index) => [
      ...(index > 0 ? [{ type: 'lineBreak' }] : []),
      ...readInlineContent(p, reading),
    ]);
  }
  return [textNode(`[${shown.kind}]`, [])];
};

const RUN_CHILDREN: ReadonlyMap<string, RunChildReader> = new Map(
  Object.entries({
    'w:t': text,
    'w:delText': text,
    'w:instrText': (element, reading) => {
      const field = reading.open.fields[reading.open.fields.length - 1];
      if (field) field.instruction += element.children.join('');
      return [];
    },
    'w:fldChar': (element, reading) => fieldChar(element, reading),
    'w:br': breakOf,
    'w:cr': () => [{ type: 'lineBreak' }],
    'w:sym': symbol,
    'w:footnoteReference': noteReference,
    'w:endnoteReference': noteReference,
    'w:drawing': drawing,
    'w:pict': drawing,
    'w:object': (element, reading, marks) => {
      // An embedded object shows its preview picture when it has one.
      const preview = findElement(element, 'v:imagedata') ? drawing(element, reading, marks) : [];
      reading.warnings.add('content-left-out', 'embedded object');
      return preview.length ? preview : [textNode('[embedded object]', [])];
    },
    'mc:AlternateContent': (element, reading, marks) => alternative(element, reading, marks),
    ...Object.fromEntries(
      Object.entries(SYMBOLS).map(([name, value]): [string, RunChildReader] => [
        name,
        (_element, _reading, marks) => [textNode(value, marks)],
      ]),
    ),
  } satisfies Record<string, RunChildReader>),
);

// One child of a run.
function runChild(element: XmlElement, reading: DocxReading, marks: StoredMark[]): StoredNode[] {
  return RUN_CHILDREN.get(element.name)?.(element, reading, marks) ?? [];
}

// Alternative content: its first choice, or its fallback when the choice shows nothing but a
// placeholder and the fallback has a picture, as a chart's or shape's fallback often does.
function alternative(element: XmlElement, reading: DocxReading, marks: StoredMark[]): StoredNode[] {
  const choice = readRunContent(childElement(element, 'mc:Choice'), reading, marks);
  const fallback = childElement(element, 'mc:Fallback');
  const placeholder = choice.length === 1 && /^\[.*\]$/.test(choice[0]?.text ?? '');
  if ((choice.length && !placeholder) || !fallback) return choice;
  const pictures = readRunContent(fallback, reading, marks).filter((node) => node.type === 'image');
  return pictures.length ? pictures : choice;
}

function readRunContent(
  element: XmlElement | null,
  reading: DocxReading,
  marks: StoredMark[],
): StoredNode[] {
  return childElements(element).flatMap((child) => runChild(child, reading, marks));
}

// A run, in the marks around it, its own and the open comments'.
function readRun(run: XmlElement, reading: DocxReading, around: StoredMark[]): StoredNode[] {
  let marks = around;
  if (reading.styles.isCaptionLabel(childValue(childElement(run, 'w:rPr'), 'w:rStyle'))) {
    marks = withMark(marks, { type: CAPTION_LABEL_MARK, attrs: { label: '' } });
  }
  for (const mark of runMarks(childElement(run, 'w:rPr'), reading)) marks = withMark(marks, mark);
  for (const id of reading.open.comments) {
    const mark = reading.commentMark(id);
    if (mark) marks = withMark(marks, mark);
  }
  for (const field of reading.open.fields) {
    const link = field.result ? fieldMark(field, reading) : null;
    if (link) marks = withMark(marks, link);
  }
  return readRunContent(run, reading, marks);
}

function hyperlinkMark(element: XmlElement, reading: DocxReading): StoredMark | null {
  const relationship = reading.part.relationships.get(element.attrs['r:id'] ?? '');
  return relationship?.external ? linkMark(relationship.target, reading) : null;
}

// A content control: a variable the writer tagged, or the content it holds.
function contentControl(
  element: XmlElement,
  reading: DocxReading,
  marks: StoredMark[],
): StoredNode[] {
  const tag = childValue(childElement(element, 'w:sdtPr'), 'w:tag') ?? '';
  const variable = /^variable:(.+)$/.exec(tag);
  if (variable) return [{ type: 'variable', attrs: { key: variable[1] } }];
  return readInlineContent(childElement(element, 'w:sdtContent'), reading, marks);
}

// Math kept as its text, since the stored format's math is a markup the file does not carry.
function mathText(element: XmlElement, reading: DocxReading): StoredNode[] {
  reading.warnings.add('equation-as-text');
  const source = findElements(element, 'm:t')
    .flatMap((text) => text.children)
    .join('');
  return [{ type: 'math', ...(source ? { attrs: { source } } : {}) }];
}

const CONTAINERS = new Set(['w:smartTag', 'w:customXml', 'w:bdo', 'w:dir']);

// Tracked changes: text inserted or moved here, and text deleted or moved away.
const CHANGES = new Map<string, 'insertion' | 'deletion'>([
  ['w:ins', 'insertion'],
  ['w:moveTo', 'insertion'],
  ['w:del', 'deletion'],
  ['w:moveFrom', 'deletion'],
]);

// A tracked change: a suggestion when the review is kept; else accepted, its insertion plain text
// and its deletion gone.
function trackedChange(
  element: XmlElement,
  change: 'insertion' | 'deletion',
  { reading, marks }: { reading: DocxReading; marks: StoredMark[] },
): StoredNode[] {
  if (reading.keepsReview) {
    return readInlineContent(
      element,
      reading,
      withMark(marks, reading.changeMark(change, element)),
    );
  }
  reading.warnings.add('review-left-out', 'tracked change');
  return change === 'insertion' ? readInlineContent(element, reading, marks) : [];
}

// One child of a paragraph or of an inline container.
function inlineChild(element: XmlElement, reading: DocxReading, marks: StoredMark[]): StoredNode[] {
  const { name } = element;
  if (name === 'w:r') return readRun(element, reading, marks);
  if (name === 'w:hyperlink') {
    const link = hyperlinkMark(element, reading);
    return readInlineContent(element, reading, link ? withMark(marks, link) : marks);
  }
  const change = CHANGES.get(name);
  if (change) return trackedChange(element, change, { reading, marks });
  if (name === 'w:commentRangeStart' && reading.keepsReview)
    reading.open.comments.push(element.attrs['w:id'] ?? '');
  if (name === 'w:commentRangeEnd') {
    reading.open.comments = reading.open.comments.filter((id) => id !== element.attrs['w:id']);
  }
  if (name === 'w:sdt') return contentControl(element, reading, marks);
  if (name === 'w:fldSimple') return simpleField(element, reading, marks);
  if (name === 'm:oMath' || name === 'm:oMathPara') return mathText(element, reading);
  return CONTAINERS.has(name) ? readInlineContent(element, reading, marks) : [];
}

function simpleField(element: XmlElement, reading: DocxReading, marks: StoredMark[]): StoredNode[] {
  reading.open.fields.push({ instruction: element.attrs['w:instr'] ?? '', result: true });
  const result = readInlineContent(element, reading, marks);
  return [...result, ...endField(reading)];
}

/** The inline content of a paragraph or inline container, in the marks around it. */
export function readInlineContent(
  element: XmlElement | null,
  reading: DocxReading,
  marks: StoredMark[] = [],
): StoredNode[] {
  return joinText(childElements(element).flatMap((child) => inlineChild(child, reading, marks)));
}
