import { describe, expect, it } from 'vitest';
import {
  formatReference,
  normalizeStructuredRevision,
  readReferenceBaseline,
  type ReferenceBaseline,
  referenceFormatError,
  referenceFormatKeyForMark,
  referenceFormatKeys,
} from './index.js';

const TARGET = {
  id: 'f3',
  kind: 'figure',
  stable: true,
  numbering: '3',
  title: 'Flow',
  label: 'Fig 3',
};

const BASELINE: ReferenceBaseline = {
  version: 1,
  documentId: 'd2',
  numbering: 'DOC-2',
  title: 'Design',
  revision: { majorRevision: 'B', minorRevision: null },
  revisionLabel: 'Rev B',
  target: TARGET,
  defaultLabel: 'DOC-2 Design',
};

describe('reference formats', () => {
  it('DOCE-SCHEMA-4.1 lists the internal keys and each external type with its target kinds', () => {
    const keys = referenceFormatKeys(['catalogue']);
    expect(keys.slice(0, 5)).toEqual([
      'internal-heading',
      'internal-figure',
      'internal-table',
      'internal-codeblock',
      'internal-equation',
    ]);
    expect(keys).toContain('external-document-table');
    expect(keys).toContain('catalogue');
    expect(keys).toContain('catalogue-equation');
    expect(keys).toHaveLength(17);
  });

  it('DOCE-SCHEMA-4.1 refines an external reference by its target and falls back to its type', () => {
    const keys = new Set(referenceFormatKeys());
    expect(referenceFormatKeyForMark('external-document', BASELINE, keys)).toBe(
      'external-document-figure',
    );
    const odd = { ...BASELINE, target: { ...TARGET, kind: 'poster' } };
    expect(referenceFormatKeyForMark('external-document', odd, keys)).toBe('external-document');
    expect(referenceFormatKeyForMark('internal-table', BASELINE, keys)).toBe('internal-table');
    expect(referenceFormatKeyForMark('', null, keys)).toBe('internal-heading');
    expect(referenceFormatKeyForMark('unknown', null, keys)).toBeNull();
  });

  it('DOCE-SCHEMA-4.2 reads recorded citation data and rejects anything malformed', () => {
    expect(readReferenceBaseline(JSON.stringify(BASELINE))).toEqual(BASELINE);
    expect(readReferenceBaseline({ ...BASELINE, version: 2 })).toBeNull();
    expect(readReferenceBaseline({ ...BASELINE, target: { id: 'x' } })).toBeNull();
    expect(readReferenceBaseline('{not json')).toBeNull();
    expect(normalizeStructuredRevision({ majorRevision: ' C ', minorRevision: '' })).toEqual({
      majorRevision: 'C',
      minorRevision: null,
    });
    expect(normalizeStructuredRevision({ minorRevision: '1' })).toBeNull();
  });

  it('DOCE-SCHEMA-4.3 formats a reference from its template tokens, as text', () => {
    const formats = {
      'external-document-figure': '{{ref.title}} in {{doc.numbering}} {{ref.revision}}',
    };
    expect(formatReference({ refType: 'external-document', baseline: BASELINE, formats })).toBe(
      'Flow in DOC-2',
    );
    expect(
      formatReference({
        refType: 'external-document',
        baseline: BASELINE,
        formats,
        includeRevision: true,
      }),
    ).toBe('Flow in DOC-2 Rev B');
    expect(
      formatReference({
        refType: 'external-document',
        baseline: BASELINE,
        formats: { 'external-document': '<b>{{doc.title}}</b>' },
        wholeDocument: true,
      }),
    ).toBe('<b>Design</b>');
  });

  it('DOCE-SCHEMA-4.3 falls back to the default label when a format is missing or invalid', () => {
    expect(referenceFormatError('{{ref.title}}')).toBeNull();
    expect(referenceFormatError('{{ref.owner}}')).toMatch(/Use only/);
    expect(referenceFormatError(3)).toMatch(/plain text/);
    expect(referenceFormatError('x'.repeat(2001))).toMatch(/2,000/);
    const invalid = { 'external-document-figure': '{{ref.owner}}' };
    expect(
      formatReference({ refType: 'external-document', baseline: BASELINE, formats: invalid }),
    ).toBe('DOC-2 Design');
    expect(
      formatReference({ refType: 'external-document', baseline: BASELINE, fallback: 'See DOC-2' }),
    ).toBe('See DOC-2');
  });
});
