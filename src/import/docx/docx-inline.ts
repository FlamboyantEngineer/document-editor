// A paragraph's runs read into stored inline content: text with its bold, italic, underline,
// strike, superscript, subscript and code marks, line and page breaks, tabs and symbols, links,
// tracked insertions and deletions, comment ranges, footnotes, images, page fields and variables.
// Formatting the stored format keeps in the template, such as fonts, sizes and colours, is left
// out with a warning; so is the result of a field it has no node for, which stays as text.

import type { StoredMark, StoredNode } from '../../model/format/document-format.js';
import type { ImportWarnings } from '../import-warnings.js';
import { joinText, textNode, withMark } from '../stored-inline.js';
import {
  childElement,
  childElements,
  childValue,
  findElements,
  type XmlElement,
} from '../xml-read.js';
import { alternativeContent, readDrawing } from './docx-drawing.js';
import type { DocxNumbering } from './docx-numbering.js';
import type { DocxPart } from './docx-package.js';
import type { DocxStyles } from './docx-styles.js';

/** A field being read: its instruction, and whether its result has started. */
interface Field {
  instruction: string;
  result: boolean;
}

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
  /** The comments whose ranges are open, and the fields being read, which may span paragraphs. */
  readonly open: { comments: string[]; fields: Field[] };
}

/** The page fields read as variables. */
const PAGE_FIELDS: Readonly<Record<string, string>> = {
  PAGE: 'page.current',
  NUMPAGES: 'page.total',
};

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

// The nodes a field gives at its end: a page variable for a page field, else none.
function endField(reading: DocxReading): StoredNode[] {
  const field = reading.open.fields.pop();
  const name = /^\s*(\S+)/.exec(field?.instruction ?? '')?.[1]?.toUpperCase() ?? '';
  const key = PAGE_FIELDS[name];
  if (key) return [{ type: 'variable', attrs: { key } }];
  if (name && name !== 'HYPERLINK') reading.warnings.add('field-as-text', name);
  return [];
}

// Whether text being read now is a page field's instruction or result, which is not kept.
function inHiddenField(reading: DocxReading): boolean {
  return reading.open.fields.some((field) => {
    if (!field.result) return true;
    const name = /^\s*(\S+)/.exec(field.instruction)?.[1]?.toUpperCase() ?? '';
    return name in PAGE_FIELDS;
  });
}

function fieldChar(element: XmlElement, reading: DocxReading): StoredNode[] {
  const kind = element.attrs['w:fldCharType'];
  if (kind === 'begin') reading.open.fields.push({ instruction: '', result: false });
  const field = reading.open.fields[reading.open.fields.length - 1];
  if (kind === 'separate' && field) field.result = true;
  return kind === 'end' ? endField(reading) : [];
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

const symbol: RunChildReader = (element, _reading, marks) => {
  const code = Number.parseInt(element.attrs['w:char'] ?? '', 16);
  return Number.isFinite(code) ? [textNode(String.fromCodePoint(code), marks)] : [];
};

const noteReference: RunChildReader = (element, reading) => {
  const kind = element.name === 'w:footnoteReference' ? 'footnote' : 'endnote';
  const content = reading.note(kind, element.attrs['w:id'] ?? '');
  return content ? [{ type: 'footnote', ...(content.length ? { content } : {}) }] : [];
};

const drawing: RunChildReader = (element, reading) => {
  const image = readDrawing(element, reading);
  return image ? [image] : [];
};

const RUN_CHILDREN: Readonly<Record<string, RunChildReader>> = {
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
  'w:object': (_element, reading) => {
    reading.warnings.add('content-left-out', 'embedded object');
    return [];
  },
  'mc:AlternateContent': (element, reading, marks) =>
    readRunContent(alternativeContent(element), reading, marks),
  ...Object.fromEntries(
    Object.entries(SYMBOLS).map(([name, value]): [string, RunChildReader] => [
      name,
      (_element, _reading, marks) => [textNode(value, marks)],
    ]),
  ),
};

// One child of a run.
function runChild(element: XmlElement, reading: DocxReading, marks: StoredMark[]): StoredNode[] {
  return RUN_CHILDREN[element.name]?.(element, reading, marks) ?? [];
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
  if (reading.styles.isCaptionLabel(childValue(childElement(run, 'w:rPr'), 'w:rStyle'))) return [];
  let marks = around;
  for (const mark of runMarks(childElement(run, 'w:rPr'), reading)) marks = withMark(marks, mark);
  for (const id of reading.open.comments) {
    const mark = reading.commentMark(id);
    if (mark) marks = withMark(marks, mark);
  }
  return readRunContent(run, reading, marks);
}

function hyperlinkMark(element: XmlElement, reading: DocxReading): StoredMark | null {
  const relationship = reading.part.relationships.get(element.attrs['r:id'] ?? '');
  return relationship?.external ? { type: 'link', attrs: { href: relationship.target } } : null;
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

// One child of a paragraph or of an inline container.
function inlineChild(element: XmlElement, reading: DocxReading, marks: StoredMark[]): StoredNode[] {
  const { name } = element;
  if (name === 'w:r') return readRun(element, reading, marks);
  if (name === 'w:hyperlink') {
    const link = hyperlinkMark(element, reading);
    return readInlineContent(element, reading, link ? withMark(marks, link) : marks);
  }
  const change = CHANGES.get(name);
  if (change) {
    return readInlineContent(
      element,
      reading,
      withMark(marks, reading.changeMark(change, element)),
    );
  }
  if (name === 'w:commentRangeStart') reading.open.comments.push(element.attrs['w:id'] ?? '');
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
