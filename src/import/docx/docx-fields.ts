// The fields of a word processing document's runs: their instructions and results as they are
// read, across runs and paragraphs. A `PAGE` or `NUMPAGES` field is a page variable, a `HYPERLINK`
// field a link, a `REF` field a cross-reference to the bookmark it names, a `SEQ` field's result a
// caption's number, and a table of contents is left out; any other field keeps its result as text,
// with a warning.

import type { StoredMark, StoredNode } from '../../model/format/document-format.js';
import { safeHref } from '../../model/schema/dom-attributes.js';
import type { XmlElement } from '../xml-read.js';
import type { DocxReading } from './docx-inline.js';

/** A field being read: its instruction, and whether its result has started. */
export interface Field {
  instruction: string;
  result: boolean;
  /** A `HYPERLINK` or `REF` field's mark, read once its result starts; null for none. */
  link?: StoredMark | null;
}

/**
 * The mark the reader puts on a caption's label and number, a `SEQ` field's result or the writer's
 * caption label runs, so the caption reader can take them off; `label` names what is numbered.
 * It never leaves the reader.
 */
export const CAPTION_LABEL_MARK = '\u0000caption-label';

/** The start of the target of a cross-reference that names a bookmark not yet resolved. */
export const BOOKMARK_TARGET = '\u0000bookmark:';
/** The page fields read as variables. */
export const PAGE_FIELDS: ReadonlyMap<string, string> = new Map([
  ['PAGE', 'page.current'],
  ['NUMPAGES', 'page.total'],
]);

// A field's name, the first word of its instruction, such as `PAGE` or `HYPERLINK`.
const fieldName = (field: Field | undefined) =>
  /^\s*(\S+)/.exec(field?.instruction ?? '')?.[1]?.toUpperCase() ?? '';

// A field's first argument, such as the bookmark of a `REF` field or the label of a `SEQ` one.
const fieldArgument = (field: Field | undefined) =>
  /^\s*\S+\s+"?([^\s"\\]+)/.exec(field?.instruction ?? '')?.[1] ?? '';

const isContents = (field: Field) => fieldName(field) === 'TOC';

// A link to an address the editor may hold, or null with a warning for one it may not, such as a
// `javascript:` address.
export function linkMark(address: string, reading: DocxReading): StoredMark | null {
  const href = safeHref(address);
  if (href === null) reading.warnings.add('content-left-out', 'unsafe link');
  return href === null ? null : { type: 'link', attrs: { href } };
}

// The address a `HYPERLINK` field's instruction names: its target, or `#<bookmark>` for `\l`.
function fieldAddress(instruction: string): string | null {
  const argument = String.raw`(?:"([^"]*)"|(\S+))`;
  const target = new RegExp(String.raw`^\s*HYPERLINK\s+(?!\\)${argument}`, 'i').exec(instruction);
  const bookmark = new RegExp(String.raw`\\l\s+${argument}`, 'i').exec(instruction);
  const address = target?.[1] ?? target?.[2] ?? '';
  const anchor = bookmark?.[1] ?? bookmark?.[2];
  const href = anchor ? `${address}#${anchor}` : address;
  return href || null;
}

// The mark a field's result takes, once its instruction is complete: a `HYPERLINK` field's link,
// a `REF` field's cross-reference to its bookmark, resolved once the whole document is read, a
// `SEQ` field's caption label; null for another field.
export function fieldMark(field: Field, reading: DocxReading): StoredMark | null {
  if (field.link === undefined) {
    const name = fieldName(field);
    if (name === 'REF') {
      field.link = {
        type: 'reference',
        attrs: {
          referenceType: 'internal-heading',
          target: BOOKMARK_TARGET + fieldArgument(field),
        },
      };
    } else if (name === 'SEQ') {
      field.link = { type: CAPTION_LABEL_MARK, attrs: { label: fieldArgument(field) } };
    } else {
      const address = name === 'HYPERLINK' ? fieldAddress(field.instruction) : null;
      field.link = address === null ? null : linkMark(address, reading);
    }
  }
  return field.link;
}

// Fields whose result the reader keeps in a form of its own, and so does not warn about.
const MARKED_FIELDS = new Set(['HYPERLINK', 'REF', 'SEQ']);

// The nodes a field gives at its end: a page variable for a page field, else none.
export function endField(reading: DocxReading): StoredNode[] {
  const field = reading.open.fields.pop();
  const name = fieldName(field);
  const key = PAGE_FIELDS.get(name);
  if (key) return [{ type: 'variable', attrs: { key } }];
  if (field && isContents(field)) {
    reading.open.contents = true;
    return [];
  }
  const marked = MARKED_FIELDS.has(name) && field?.link;
  if (name && !marked) reading.warnings.add('field-as-text', name);
  return [];
}

// Whether text being read now is a field's instruction, or the result of a page field or a table
// of contents, which is not kept.
export function inHiddenField(reading: DocxReading): boolean {
  return reading.open.fields.some(
    (field) => !field.result || PAGE_FIELDS.has(fieldName(field)) || isContents(field),
  );
}

export function fieldChar(element: XmlElement, reading: DocxReading): StoredNode[] {
  const kind = element.attrs['w:fldCharType'];
  if (kind === 'begin') reading.open.fields.push({ instruction: '', result: false });
  const field = reading.open.fields[reading.open.fields.length - 1];
  if (kind === 'separate' && field) {
    field.result = true;
    if (isContents(field)) reading.open.contents = true;
  }
  return kind === 'end' ? endField(reading) : [];
}
