// The package around a word processing document's parts: the content type of each part, and the
// relationships that tie the parts to the document and the document to its links.

import { escapeXml, XML_DECLARATION } from './word-xml.js';

/** A part of the package: its path, content type and data. */
export interface PackagePart {
  readonly path: string;
  readonly type: string;
  readonly data: string;
}

/** A relationship of a part: its id, kind and target. */
export interface PartRelationship {
  readonly id: string;
  readonly kind: string;
  readonly target: string;
  readonly external?: boolean | undefined;
}

const OFFICE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const WORD = 'application/vnd.openxmlformats-officedocument.wordprocessingml';

/** The relationship kind of each part the writer writes. */
export const RELATIONSHIP_KINDS = {
  document: `${OFFICE}/officeDocument`,
  styles: `${OFFICE}/styles`,
  numbering: `${OFFICE}/numbering`,
  settings: `${OFFICE}/settings`,
  footnotes: `${OFFICE}/footnotes`,
  comments: `${OFFICE}/comments`,
  commentsExtended: 'http://schemas.microsoft.com/office/2011/relationships/commentsExtended',
  header: `${OFFICE}/header`,
  footer: `${OFFICE}/footer`,
  hyperlink: `${OFFICE}/hyperlink`,
} as const;

/** The content type of each part the writer writes. */
export const CONTENT_TYPES = {
  document: `${WORD}.document.main+xml`,
  styles: `${WORD}.styles+xml`,
  numbering: `${WORD}.numbering+xml`,
  settings: `${WORD}.settings+xml`,
  footnotes: `${WORD}.footnotes+xml`,
  comments: `${WORD}.comments+xml`,
  commentsExtended: `${WORD}.commentsExtended+xml`,
  header: `${WORD}.header+xml`,
  footer: `${WORD}.footer+xml`,
} as const;

/** A part's relationships to the links it holds, by their ids. */
export function linkRelationships(links: readonly string[]): PartRelationship[] {
  return links.map((href, index) => ({
    id: `rIdLink${String(index + 1)}`,
    kind: RELATIONSHIP_KINDS.hyperlink,
    target: href,
    external: true,
  }));
}

/** A relationships part. */
export function writeRelationships(relationships: readonly PartRelationship[]): string {
  return [
    XML_DECLARATION,
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    ...relationships.map(
      (relationship) =>
        `<Relationship Id="${relationship.id}" Type="${relationship.kind}" Target="${escapeXml(relationship.target)}"${relationship.external ? ' TargetMode="External"' : ''}/>`,
    ),
    '</Relationships>',
  ].join('');
}

/** The content types part, naming each part's type. */
export function writeContentTypes(parts: readonly PackagePart[]): string {
  return [
    XML_DECLARATION,
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    ...parts.map(
      (part) => `<Override PartName="/${escapeXml(part.path)}" ContentType="${part.type}"/>`,
    ),
    '</Types>',
  ].join('');
}
