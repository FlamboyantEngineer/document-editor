import { describe, expect, it } from 'vitest';
import type { StoredNode } from './document-format.js';
import { isLeftOut, keptContent } from './left-out.js';
import { assetAddress, variableText } from './writer-values.js';

const inserted: StoredNode = { type: 'figure', attrs: { suggestionKind: 'insertion' } };
const deleted: StoredNode = { type: 'paragraph', attrs: { suggestionKind: 'deletion' } };
const insertedText: StoredNode = { type: 'text', text: 'new', marks: [{ type: 'insertion' }] };
const deletedText: StoredNode = { type: 'text', text: 'old', marks: [{ type: 'deletion' }] };
const plain: StoredNode = { type: 'paragraph' };

describe('isLeftOut', () => {
  it('DOCE-FORMAT-5.3 leaves out suggested deletions when accepted and insertions when rejected', () => {
    expect(
      [inserted, deleted, insertedText, deletedText, plain].map((node) =>
        isLeftOut(node, 'accepted'),
      ),
    ).toEqual([false, true, false, true, false]);
    expect(
      [inserted, deleted, insertedText, deletedText, plain].map((node) =>
        isLeftOut(node, 'rejected'),
      ),
    ).toEqual([true, false, true, false, false]);
  });

  it('DOCE-FORMAT-5.3 keeps the content a writer writes', () => {
    expect(keptContent([inserted, plain, deleted], 'accepted')).toEqual([inserted, plain]);
    expect(keptContent([inserted, plain, deleted], 'rejected')).toEqual([plain, deleted]);
    expect(keptContent(undefined, 'accepted')).toEqual([]);
  });
});

describe('writer values', () => {
  it('DOCE-FORMAT-5.3 resolves variables, keeping the key when the host has no value', () => {
    const node: StoredNode = { type: 'variable', attrs: { key: 'document.title' } };
    expect(
      variableText(node, { variable: (key) => (key === 'document.title' ? 'Field notes' : null) }),
    ).toBe('Field notes');
    expect(variableText(node)).toBe('{{document.title}}');
  });

  it('DOCE-FORMAT-5.3 resolves an asset address, falling back to the stored source', () => {
    const figure: StoredNode = {
      type: 'figure',
      attrs: { assetId: 'a1', assetRevision: 'r2', src: 'stored.png' },
    };
    const asset = (named: { id: string; revision?: string | undefined }) =>
      `https://assets.example/${named.id}/${named.revision ?? 'latest'}`;
    expect(assetAddress(figure, { asset })).toBe('https://assets.example/a1/r2');
    expect(assetAddress(figure)).toBe('stored.png');
    expect(assetAddress({ type: 'figure' }, { asset })).toBe('');
  });
});
