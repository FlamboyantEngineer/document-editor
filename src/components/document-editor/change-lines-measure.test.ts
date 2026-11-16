import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { installEditorDom } from '../../../test/editor-dom.js';
import { readDocumentFile, type TemplateFile } from '../../model/index.js';
import { measureBlockLines, shownChangesAt } from './change-lines-measure.js';

// A block whose one line holds a modified word and an inserted one.
function changedBlock() {
  const block = document.createElement('p');
  block.setAttribute('data-diff-lines', 'text');
  for (const kind of ['modification', 'insertion']) {
    const word = document.createElement('span');
    word.setAttribute('data-diff-line', kind);
    word.textContent = kind;
    block.append(word);
  }
  return block;
}

const TEMPLATE: TemplateFile = {
  formatVersion: 1,
  id: 'bars',
  changeBars: { modifications: { enabled: false } },
  sections: [{ name: 'appendix', changeBars: { modifications: { enabled: true } } }],
};

function positionIn(section: string | null) {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: section, content: [{ type: 'paragraph' }] }] },
    documentSchema,
  ).doc;
  let at = 0;
  doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') at = pos + 1;
    return at === 0;
  });
  return doc.resolve(at);
}

installEditorDom();

describe('measureBlockLines', () => {
  it('DOCE-VERSIONS-2.4 merges a line into its strongest kind of change', () => {
    expect(measureBlockLines(changedBlock(), { scale: 1 }).map((line) => line.kind)).toEqual([
      'modification',
    ]);
  });

  it('DOCE-VERSIONS-2.4 never lets a kind the template hides hide a shown one on its line', () => {
    const shown = shownChangesAt(TEMPLATE, positionIn(null));
    expect(shown('modification')).toBe(false);
    expect(measureBlockLines(changedBlock(), { scale: 1, shown }).map((line) => line.kind)).toEqual(
      ['insertion'],
    );
  });

  it('DOCE-VERSIONS-2.4 takes the change bars of a section over the template', () => {
    expect(shownChangesAt(TEMPLATE, positionIn('appendix'))('modification')).toBe(true);
  });

  it('DOCE-EDITOR-6.5 bars every line a suggestion shows on, where its deleted text would be', () => {
    const rect = (top: number, bottom: number) => new DOMRect(0, top, 100, bottom - top);
    const block = document.createElement('p');
    block.getBoundingClientRect = () => rect(0, 80);
    const plain = document.createElement('span');
    plain.textContent = 'Kept text on the first line ';
    plain.getClientRects = () => Object.assign([rect(0, 20)]) as unknown as DOMRectList;
    // Suggested text over the second and third lines, and hidden suggested deletion on the fourth.
    const inserted = document.createElement('ins');
    inserted.setAttribute('data-id', 's1');
    inserted.textContent = 'inserted text that wraps';
    inserted.getClientRects = () =>
      Object.assign([rect(20, 40), rect(40, 60)]) as unknown as DOMRectList;
    const deleted = document.createElement('del');
    deleted.setAttribute('data-id', 's2');
    deleted.textContent = 'gone';
    deleted.getBoundingClientRect = () => rect(62, 78);
    block.append(plain, inserted, deleted);

    const lines = measureBlockLines(block, { scale: 1, suggestions: true });
    // jsdom lays out no plain text, so the first measured line reaches the block's top.
    expect(lines.map((line) => [line.kind, line.top, line.height])).toEqual([
      ['suggestion', 0, 40],
      ['suggestion', 40, 21],
      ['suggestion', 61, 19],
    ]);
    // Without the change bars markup, suggestions draw no bars of their own.
    expect(measureBlockLines(block, { scale: 1 })).toEqual([]);
  });
});
