// How a list of references shows each cited document: what identifies it (publisher, then number
// with revision), a dash, then its title; a work with authors as a paper is cited; and what a
// template or the citation formatted for the whole document in place of both. Each document, and
// each revision of it, is one entry, grouped by its reference type and ordered by publisher and
// number, the documents that recorded no number last.

import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import { readReferenceBaseline } from '../reference-format.js';
import type { CatalogEntry } from './contents-kinds.js';

const attrText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** A citation's recorded parts, as its reference mark keeps them. */
interface CitedParts {
  readonly publisher: string;
  readonly number: string;
  readonly revision: string;
  readonly title: string;
  readonly authors: string;
  readonly pages: string;
}

function partsOf(mark: Mark | undefined): CitedParts {
  const attrs = mark?.attrs ?? {};
  return {
    publisher: attrText(attrs.docPublisher),
    number: attrText(attrs.docNumber),
    revision: attrText(attrs.docRevision),
    title: attrText(attrs.docTitle) || attrText(attrs.libraryLabel),
    authors: attrText(attrs.docAuthors),
    pages: attrText(attrs.docPages),
  };
}

// What a citation formatted for the whole document, which replaces its parts.
const formattedOf = (mark: Mark | undefined) =>
  readReferenceBaseline(mark?.attrs.referenceBaseline)?.bibliographyLabel?.trim() ?? '';

// A work with authors, cited as a paper: authors, (year), title, pages and number, each ending
// in a full stop and left out when the citation did not record it. Its revision is its year.
function paperText({ authors, revision, title, pages, number }: CitedParts): string {
  return [authors, revision ? `(${revision})` : '', title, pages, number]
    .filter(Boolean)
    .map((part) => (part.endsWith('.') ? part : `${part}.`))
    .join(' ');
}

/**
 * What identifies a cited document: its publisher, then its number with its revision, neither
 * repeated when the number already ends in its revision or starts with its publisher. Empty for a
 * document cited by a formatted text or as a paper.
 */
export function citedNumber(_node: ProseMirrorNode, mark?: Mark): string {
  const parts = partsOf(mark);
  if (formattedOf(mark) || parts.authors) return '';
  const { publisher, number, revision } = parts;
  const numbered =
    revision && !number.toLowerCase().endsWith(revision.toLowerCase())
      ? `${number} ${revision}`.trim()
      : number;
  const named = Boolean(publisher) && numbered.toLowerCase().startsWith(publisher.toLowerCase());
  return [named ? '' : publisher, numbered].filter(Boolean).join(' ');
}

/**
 * A cited document's title; or the text formatted for the whole document, or the paper citation
 * of a work with authors; or, for a citation that recorded none of its parts, the text it reads.
 */
export function citedText(node: ProseMirrorNode, mark?: Mark, runText = node.textContent): string {
  const formatted = formattedOf(mark);
  if (formatted) return formatted;
  const parts = partsOf(mark);
  if (parts.authors) return paperText(parts);
  if (parts.title || citedNumber(node, mark)) return parts.title;
  return runText.trim();
}

/**
 * What makes two citations one entry: the document they cite, by its reference type and target,
 * or its number and title when it recorded no target, and the revision they cite.
 */
export function citedIdentity(node: ProseMirrorNode, mark?: Mark, runText?: string): string {
  const attrs = mark?.attrs ?? {};
  const parts = partsOf(mark);
  const target =
    attrText(attrs.targetId) || `${parts.number}\u0000${citedText(node, mark, runText)}`;
  const revision = parts.revision || attrText(attrs.libraryRevisionId);
  return [attrText(attrs.refType), target, revision].join('\u0000');
}

/** A citation's group, its reference type. */
export const citedGroup = (_node: ProseMirrorNode, mark?: Mark) => attrText(mark?.attrs.refType);

/**
 * Where a citation sorts in its group: those that recorded a number first, then by publisher,
 * number, revision and text.
 */
export function citedOrder(
  node: ProseMirrorNode,
  mark?: Mark,
  runText?: string,
): readonly string[] {
  const { publisher, number, revision } = partsOf(mark);
  return [number ? '0' : '1', publisher, number, revision, citedText(node, mark, runText)];
}

/** The citation's attributes, which say where its entry opens. */
export const citedAttrs = (
  _node: ProseMirrorNode,
  mark?: Mark,
): Readonly<Record<string, unknown>> => mark?.attrs ?? {};

// The document a citation's entry names: its reference type and target.
const documentOf = (entry: CatalogEntry) =>
  `${attrText(entry.cites?.refType)}\u0000${attrText(entry.cites?.targetId)}`;

/**
 * The citations without those that recorded no document number where a citation of the same
 * document, by its target, did: such a citation, stored before its parts were recorded or pasted from where they
 * were not, lists as the words it reads, a second and worse row for one document. A document cited
 * only that way still lists.
 */
export function dropUnnamedCitations(entries: readonly CatalogEntry[]): CatalogEntry[] {
  const named = new Set(
    entries.filter((entry) => attrText(entry.cites?.docNumber)).map(documentOf),
  );
  return entries.filter(
    (entry) =>
      Boolean(attrText(entry.cites?.docNumber)) ||
      !attrText(entry.cites?.targetId) ||
      !named.has(documentOf(entry)),
  );
}
