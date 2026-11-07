// The reference mark: text that cites a heading, figure, table, code block or equation in this
// document, another document, or an entry of a host's own catalogue. A citation keeps what it
// lists, such as the cited document's number and title, so a list of references prints without
// resolving anything.

import type { Mark, MarkSpec } from 'prosemirror-model';
import { referenceFormatKeyForMark, referenceFormatKeys } from '../reference-format.js';
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

function readReferenceAttrs(dom: HTMLElement): Record<string, unknown> {
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
