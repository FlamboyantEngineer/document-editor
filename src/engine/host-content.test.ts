import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { isHostContentAt } from './host-content.js';

const paragraph = (value: string): StoredNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text: value }],
});

const DOC = readDocumentFile(
  {
    formatVersion: 1,
    sections: [
      {
        name: null,
        content: [
          paragraph('Intro'),
          {
            type: 'embed',
            attrs: { id: 'e0000001', kind: 'data-set', source: 'set-7', label: 'Set 7' },
            content: [paragraph('Total 42')],
          },
          { type: 'script', attrs: { id: 'f0000001', source: 'one' }, content: [paragraph('Ran')] },
        ],
      },
    ],
  },
  documentSchema,
).doc;

// Where a node of a type starts, and where a piece of text does.
function startOf(typeName: string): number {
  let found = -1;
  DOC.descendants((node, pos) => {
    if (found < 0 && node.type.name === typeName) found = pos;
  });
  return found;
}

function textAt(value: string): number {
  let found = -1;
  DOC.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text === value) found = pos;
  });
  return found;
}

describe('host content', () => {
  it('DOCE-EMBEDS-2.1 tells the inside of an embed and of a script’s output from the rest', () => {
    expect(isHostContentAt(DOC, textAt('Intro'))).toBe(false);
    expect(isHostContentAt(DOC, textAt('Total 42'))).toBe(true);
    expect(isHostContentAt(DOC, textAt('Ran'))).toBe(true);
    // Before and after the whole block is the writer's: a block goes in there, or the block out.
    const embed = startOf('embed');
    expect(isHostContentAt(DOC, embed)).toBe(false);
    expect(isHostContentAt(DOC, embed + 1)).toBe(true);
    expect(isHostContentAt(DOC, embed + (DOC.nodeAt(embed)?.nodeSize ?? 0))).toBe(false);
    expect(isHostContentAt(DOC, DOC.content.size + 10)).toBe(false);
  });
});
