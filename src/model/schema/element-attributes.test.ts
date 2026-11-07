import { describe, expect, it } from 'vitest';
import { documentSchema, findNode, parseMarkup, roundTrip } from '../../../test/document-markup.js';
import { normalizeParagraphLevel } from '../index.js';

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
});
