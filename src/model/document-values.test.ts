// What a document stores beside its content (DOCE-FORMAT-1.7): its language and its variables'
// texts.

import { Transform } from 'prosemirror-transform';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  BASE_TEMPLATE,
  canonicalLanguage,
  documentLanguage,
  readDocumentFile,
  storedValue,
  storedValues,
} from './index.js';

const empty = () =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content: [] }] }, documentSchema)
    .doc;

describe('document values', () => {
  it('DOCE-PAGINATION-9.16 takes the document language, else the template one, else English', () => {
    const doc = empty();
    expect(documentLanguage(doc, { language: 'fr-CA' })).toBe('fr-CA');
    expect(documentLanguage(doc, BASE_TEMPLATE)).toBe('en');
    expect(documentLanguage(doc, null)).toBe('en');
    // A template language that is no tag counts as none.
    expect(documentLanguage(doc, { language: 'not a tag!' })).toBe('en');
    const own = new Transform(doc).setDocAttribute('language', 'de-CH').doc;
    expect(documentLanguage(own, { language: 'fr-CA' })).toBe('de-CH');
    // Never empty, so a layout never falls back to a browser's default.
    expect(documentLanguage(null, { language: '' })).toBe('en');
  });

  it('DOCE-FORMAT-1.7 writes a language tag in its canonical form', () => {
    expect(canonicalLanguage('EN-gb')).toBe('en-GB');
    expect(canonicalLanguage(' th ')).toBe('th');
    expect(canonicalLanguage('')).toBeNull();
    expect(canonicalLanguage('en_GB!')).toBeNull();
    expect(canonicalLanguage(3)).toBeNull();
  });

  it('DOCE-FORMAT-1.7 refuses a language or values of the wrong kind on the top node', () => {
    const doc = empty();
    expect(() => documentSchema.topNodeType.create({ language: 'EN-gb' }, doc.content)).toThrow();
    expect(() =>
      documentSchema.topNodeType.create({ values: { 'document.name': 3 } }, doc.content),
    ).toThrow();
    const valued = documentSchema.topNodeType.create(
      { language: 'en-GB', values: { 'document.name': 'Interface notes' } },
      doc.content,
    );
    expect(storedValue(valued, 'document.name')).toBe('Interface notes');
    expect(storedValue(valued, 'document.owner')).toBe('');
    expect(storedValues(doc)).toEqual({});
  });
});
