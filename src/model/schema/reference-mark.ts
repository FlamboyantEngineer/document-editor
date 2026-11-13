// The reference mark: text that cites a heading, figure, table, code block or equation in this
// document, another document, or an entry of a host's own catalogue. A citation keeps what it
// lists, such as the cited document's number and title, so a list of references prints without
// resolving anything.

import type { Mark, MarkSpec } from 'prosemirror-model';
import {
  readReferenceBaseline,
  type ReferenceBaseline,
  referenceFormatKeyForMark,
  referenceFormatKeys,
} from '../reference-format.js';
import type { DomAttributes } from './dom-attributes.js';
import type { ResolvedSchemaOptions } from './schema-options.js';

/** Each stored text attribute and the element attribute it is written to. */
const TEXT_ATTRS = [
  ['referenceBaseline', 'data-reference-baseline'],
  ['targetId', 'data-target-id'],
  ['subTarget', 'data-sub-target'],
  // A catalogue entry is cited at an exact revision, with the label it had then.
  ['libraryRevisionId', 'data-library-revision-id'],
  ['libraryLabel', 'data-library-label'],
  // The cited document, as a list of references prints it.
  ['docPublisher', 'data-doc-publisher'],
  ['docNumber', 'data-doc-number'],
  ['docRevision', 'data-doc-revision'],
  ['docTitle', 'data-doc-title'],
  ['docAuthors', 'data-doc-authors'],
  ['docPages', 'data-doc-pages'],
] as const;

/** A citation of another document as print links it: its reference type and what it records. */
export interface PrintedCitation {
  readonly refType: string;
  readonly baseline: ReferenceBaseline;
}

/** The address a printed citation of another document links to; null leaves it unlinked. */
export type CitationHref = (citation: PrintedCitation) => string | null;

/**
 * Where a reference links in print, from its stored attributes: an internal one to its target's
 * anchor, the target's element id; a citation of another document where the host says (`href`);
 * a broken one nowhere.
 */
export function referencePrintHref(
  attrs: Readonly<Record<string, unknown>>,
  href?: CitationHref,
): string | null {
  if (attrs.broken === true) return null;
  const refType = typeof attrs.refType === 'string' ? attrs.refType : 'internal-heading';
  if (refType.startsWith('internal-')) {
    return typeof attrs.targetId === 'string' && attrs.targetId ? `#${attrs.targetId}` : null;
  }
  const baseline = readReferenceBaseline(attrs.referenceBaseline);
  return baseline && href ? href({ refType, baseline }) : null;
}

/** A rendered reference's stored attributes, as its element writes them. */
export function readReferenceAttrs(dom: Element): Record<string, unknown> {
  const attrs: Record<string, unknown> = {
    refType: dom.getAttribute('data-ref-type') || 'internal-heading',
    includeRevision: dom.getAttribute('data-include-revision') === 'true',
    broken: dom.getAttribute('data-broken') === 'true',
  };
  for (const [name, attribute] of TEXT_ATTRS) attrs[name] = dom.getAttribute(attribute) || null;
  return attrs;
}

/** The reference mark, which writes each saved reference's format key for templates to style. */
export function createReferenceMark(options: ResolvedSchemaOptions): MarkSpec {
  const keys: ReadonlySet<string> = new Set(referenceFormatKeys(options.referenceTypes));
  return {
    // In the order stored documents list them.
    attrs: {
      refType: { default: 'internal-heading' },
      targetId: { default: null },
      subTarget: { default: null },
      includeRevision: { default: false },
      broken: { default: false },
      referenceBaseline: { default: null },
      libraryRevisionId: { default: null },
      libraryLabel: { default: null },
      docPublisher: { default: null },
      docNumber: { default: null },
      docRevision: { default: null },
      docTitle: { default: null },
      docAuthors: { default: null },
      docPages: { default: null },
    },
    inclusive: false,
    parseDOM: [{ tag: 'span[data-reference="true"]', getAttrs: readReferenceAttrs }],
    toDOM(mark: Mark) {
      const { refType, broken, includeRevision, referenceBaseline } = mark.attrs;
      const attrs: DomAttributes = {
        'data-reference': 'true',
        'data-ref-type': String(refType || 'internal-heading'),
        class: `inline-reference${broken ? ' reference-broken' : ''}`,
      };
      for (const [name, attribute] of TEXT_ATTRS) {
        if (mark.attrs[name]) attrs[attribute] = String(mark.attrs[name]);
      }
      if (includeRevision) attrs['data-include-revision'] = 'true';
      if (broken) attrs['data-broken'] = 'true';
      // Derived and never parsed: a template's presentation of each reference type keys on it.
      const formatKey = referenceFormatKeyForMark(refType, referenceBaseline, keys);
      if (formatKey) attrs['data-reference-format'] = formatKey;
      return ['span', attrs, 0];
    },
  };
}
