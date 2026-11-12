import { describe, expect, it } from 'vitest';
import { documentSchema, findNode, parseMarkup, roundTrip } from '../../../test/document-markup.js';
import { createDocumentSchema, type IdentityAttribute, normalizeParagraphLevel } from '../index.js';
import {
  clearIdentityAttrs,
  identityAttributesOf,
  pickIdentityAttrs,
} from './element-attributes.js';

const REVIEW_STATE: IdentityAttribute = {
  name: 'reviewState',
  dom: 'data-review-state',
  scope: ['paragraph', 'heading'],
  onCopy: 'clear',
};
const ORIGIN: IdentityAttribute = { name: 'origin', dom: 'data-origin', onCopy: 'keep' };

describe('element attributes', () => {
  it('DOCE-SCHEMA-2.1 gives every node type but text an id, its author and its split part', () => {
    for (const [name, type] of Object.entries(documentSchema.nodes)) {
      if (name === 'text') continue;
      expect(Object.keys(type.spec.attrs ?? {}), name).toEqual(
        expect.arrayContaining(['dataId', 'dataAuthor', 'dataAiSession', 'splitPartIndex']),
      );
    }
    expect(documentSchema.nodes.text?.spec.attrs).toBeUndefined();
  });

  it('DOCE-SCHEMA-2.1 reads and writes them on the element', () => {
    const html =
      '<p data-id="p1" data-paragraph-level="3" data-au="ada" data-ai="s1" data-split-part-index="2" data-suggestion-split-kind="split" data-suggestion-split-id="x1">Text</p>';
    const doc = parseMarkup(html);
    expect(doc.firstChild?.attrs).toMatchObject({
      dataId: 'p1',
      paragraphLevel: 3,
      dataAuthor: 'ada',
      dataAiSession: 's1',
      splitPartIndex: 2,
      suggestionSplitKind: 'split',
      suggestionSplitId: 'x1',
    });
    expect(roundTrip(html)).toBe(html);
  });

  it('DOCE-SCHEMA-2.1 marks a list item that continues an orphaned list', () => {
    const html = '<ul><li data-orphaned-list-continuation="true"><p>Item</p></li></ul>';
    expect(findNode(parseMarkup(html), 'list_item')?.attrs.orphanedListContinuation).toBe(true);
    expect(roundTrip(html)).toBe(html);
  });

  it('DOCE-SCHEMA-2.2 keeps a paragraph level from 1 to 6 and writes it only above 1', () => {
    expect([0, 1, 4, 9, 2.5, 'x'].map(normalizeParagraphLevel)).toEqual([1, 1, 4, 6, 1, 1]);
    expect(roundTrip('<p data-paragraph-level="9">Deep</p>')).toBe(
      '<p data-paragraph-level="6">Deep</p>',
    );
    expect(roundTrip('<p data-paragraph-level="1">Top</p>')).toBe('<p>Top</p>');
  });

  it('DOCE-SCHEMA-2.3 declares the built-in identity attributes on every node type but text', () => {
    const names = (type: string) =>
      identityAttributesOf(documentSchema.nodes[type] ?? documentSchema.topNodeType).map(
        (attribute) => attribute.name,
      );
    expect(names('table')).toEqual(['dataId', 'dataAuthor', 'dataAiSession', 'splitPartIndex']);
    expect(names('heading')).toEqual([
      'dataId',
      'dataAuthor',
      'dataAiSession',
      'splitPartIndex',
      'suggestionSplitKind',
      'suggestionSplitId',
    ]);
    expect(
      identityAttributesOf(documentSchema.nodes.paragraph ?? documentSchema.topNodeType).every(
        (attribute) => attribute.onCopy === 'clear',
      ),
    ).toBe(true);
  });

  it('DOCE-SCHEMA-2.3 gives the types in scope a host identity attribute, read and written', () => {
    const schema = { identityAttributes: [REVIEW_STATE, ORIGIN] };
    const html = '<p data-review-state="done" data-origin="import">Text</p>';
    expect(roundTrip(html, { schema })).toBe(html);
    const built = createDocumentSchema({ schema });
    expect(built.nodes.paragraph?.spec.attrs).toHaveProperty('reviewState');
    expect(built.nodes.table?.spec.attrs).not.toHaveProperty('reviewState');
    expect(built.nodes.table?.spec.attrs).toHaveProperty('origin');
    expect(roundTrip('<p data-review-state="">Text</p>', { schema })).toBe('<p>Text</p>');
  });

  it('DOCE-SCHEMA-2.3 refuses a host identity attribute named as a built-in one', () => {
    const clash: IdentityAttribute = { name: 'dataId', dom: 'data-other', onCopy: 'keep' };
    expect(() => createDocumentSchema({ schema: { identityAttributes: [clash] } })).toThrow(
      'dataId',
    );
  });

  it('DOCE-SCHEMA-2.3 picks and clears identity attributes as a copy does', () => {
    const built = createDocumentSchema({ schema: { identityAttributes: [REVIEW_STATE, ORIGIN] } });
    const type = built.nodes.paragraph;
    if (!type) throw new Error('No paragraph type');
    const attrs = {
      ...type.create().attrs,
      dataId: 'aaaa0001',
      dataAuthor: 'ada',
      reviewState: 'done',
      origin: 'import',
      paragraphLevel: 3,
    };
    expect(pickIdentityAttrs(type, attrs)).toMatchObject({
      dataId: 'aaaa0001',
      dataAuthor: 'ada',
      reviewState: 'done',
      origin: 'import',
    });
    expect(pickIdentityAttrs(type, attrs)).not.toHaveProperty('paragraphLevel');
    expect(clearIdentityAttrs(type, attrs)).toMatchObject({
      dataId: null,
      dataAuthor: null,
      reviewState: null,
      origin: 'import',
      paragraphLevel: 3,
    });
  });
});
