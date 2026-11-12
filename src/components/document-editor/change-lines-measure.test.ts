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
  );
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
});
