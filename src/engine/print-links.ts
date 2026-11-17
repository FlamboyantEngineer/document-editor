// The links a printed snapshot keeps: an anchor on each element with an element id, internal
// references linking to their targets and citations of other documents to where the host says,
// footnote markers linking to their entries and each entry's number back to its marker,
// abbreviations linking to their list rows, and the numbers the stylesheet's counters print,
// written on their elements as static text.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { catalogDocument, ELEMENT_KINDS, type TemplateFile } from '../model/index.js';
import { footnoteEntryAnchor, footnoteMarkerAnchor } from '../model/schema/footnote-nodes.js';
import {
  type CitationHref,
  readReferenceAttrs,
  referencePrintHref,
} from '../model/schema/reference-mark.js';

/** The hook a printed link carries, naming what it links. */
export const PRINT_LINK_ATTRIBUTE = 'data-print-link';

/**
 * What a printed link links: a reference's target, a footnote's entry or back to its marker, a
 * list of contents entry's element, or an abbreviation's row in a list of abbreviations.
 */
type PrintLinkKind =
  'reference' | 'citation' | 'footnote' | 'footnote-back' | 'contents' | 'abbreviation';

/** The link inside each abbreviation, which goes to its row in a list of abbreviations. */
const ABBREVIATION_LINK = 'span[data-abbreviation-ref] > a[href^="#"]';

// Wraps an element's content in a link, which a snapshot's print rules leave styled as the text.
function linkContent(element: Element, href: string, kind: PrintLinkKind) {
  const link = element.ownerDocument.createElement('a');
  link.setAttribute('href', href);
  link.setAttribute(PRINT_LINK_ATTRIBUTE, kind);
  link.append(...element.childNodes);
  element.append(link);
}

// Puts an anchor on an element unless an earlier one carries it, as the first part of a block the
// pages split does.
function anchor(element: Element, id: string, taken: Set<string>) {
  if (taken.has(id)) return;
  taken.add(id);
  element.setAttribute('id', id);
}

function linkReferences(copy: Element, href: CitationHref | undefined) {
  for (const element of copy.querySelectorAll('span[data-reference="true"]')) {
    const attrs = readReferenceAttrs(element);
    const target = referencePrintHref(attrs, href);
    if (!target) continue;
    const internal = String(attrs.refType).startsWith('internal-');
    linkContent(element, target, internal ? 'reference' : 'citation');
  }
}

function linkFootnotes(copy: Element, taken: Set<string>) {
  for (const marker of copy.querySelectorAll('sup.footnote-reference[data-footnote-id]')) {
    const id = marker.getAttribute('data-footnote-id') ?? '';
    anchor(marker, footnoteMarkerAnchor(id), taken);
    linkContent(marker, `#${footnoteEntryAnchor(id)}`, 'footnote');
  }
  for (const entry of copy.querySelectorAll('.pm-footnote-entry[data-footnote-id]')) {
    const id = entry.getAttribute('data-footnote-id') ?? '';
    const first = !taken.has(footnoteEntryAnchor(id));
    anchor(entry, footnoteEntryAnchor(id), taken);
    const number = entry.querySelector(':scope > .pm-footnote-entry-number');
    if (first && number) linkContent(number, `#${footnoteMarkerAnchor(id)}`, 'footnote-back');
  }
}

// Links each part of a list of contents row that names an element in the snapshot to it, its
// number, text and page each, so the row keeps its layout.
function linkContents(copy: Element, taken: ReadonlySet<string>) {
  for (const row of copy.querySelectorAll('.de-contents__entry[data-target]')) {
    const target = row.getAttribute('data-target') ?? '';
    if (!taken.has(target)) continue;
    const parts = row.querySelectorAll(
      ':scope > .de-contents__number, :scope > .de-contents__text, :scope > .de-contents__page',
    );
    for (const part of parts) linkContent(part, `#${target}`, 'contents');
  }
}

// Marks each abbreviation's link to a row the snapshot holds as a printed link; one whose list is
// not in the snapshot gives way to its text. Its abbreviation keeps its expansion
// (`data-abbr`, `data-expansion`) and the link its tooltip (`data-abbr-tooltip`).
function linkAbbreviations(copy: Element) {
  const ids = new Set([...copy.querySelectorAll('[id]')].map((element) => element.id));
  for (const link of copy.querySelectorAll(ABBREVIATION_LINK)) {
    if (ids.has((link.getAttribute('href') ?? '').slice(1)))
      link.setAttribute(PRINT_LINK_ATTRIBUTE, 'abbreviation');
    else link.replaceWith(...link.childNodes);
  }
}

/** The number the template gives each numbered heading and object, by its element id. */
export function elementNumbers(
  doc: ProseMirrorNode,
  template: TemplateFile,
): ReadonlyMap<string, string> {
  const numbers = new Map<string, string>();
  for (const entries of Object.values(catalogDocument(doc, template, ELEMENT_KINDS))) {
    for (const entry of entries) {
      const id = doc.nodeAt(entry.pos)?.attrs.dataId as unknown;
      const number = entry.number.trim();
      if (typeof id === 'string' && id && number && !numbers.has(id)) numbers.set(id, number);
    }
  }
  return numbers;
}

/** What a snapshot's links are made from. */
interface PrintLinkOptions {
  /** The number of each numbered element, by its element id (`elementNumbers`). */
  readonly numbers: ReadonlyMap<string, string>;
  /** Where a citation of another document links; unlinked without it. */
  readonly href?: CitationHref | undefined;
}

/**
 * Adds a snapshot's links to a copy of the pages' markup: an anchor, the element id, on the first
 * element carrying each element id, links from internal references to their targets and from
 * citations to the host's address, footnote markers and entries linked both ways, and each
 * numbered element's number in `data-number` beside its anchor, each list of contents row
 * linked to the element it names, and each abbreviation linked to its row in a list of
 * abbreviations.
 */
export function addPrintLinks(copy: Element, { numbers, href }: PrintLinkOptions): void {
  const taken = new Set<string>();
  for (const element of copy.querySelectorAll('[data-id]')) {
    const id = element.getAttribute('data-id') ?? '';
    if (!id || taken.has(id)) continue;
    anchor(element, id, taken);
    const number = numbers.get(id);
    if (number) element.setAttribute('data-number', number);
  }
  linkReferences(copy, href);
  linkFootnotes(copy, taken);
  linkContents(copy, taken);
  linkAbbreviations(copy);
}
