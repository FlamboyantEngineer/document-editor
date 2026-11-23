import { EditorState, Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { node, page, pagesDocument, pagesState, stubEngine } from '../../test/pages-fixtures.js';
import { compareVersions } from '../engine/version-compare.js';
import { versionChangeDecorations } from '../engine/version-decorations.js';
import { type DocumentFile, readDocumentFile } from '../model/index.js';
import { forcedLinesKey } from './forced-lines.js';
import { drawReservedText, insertedReservedBoxes, withReservedWords } from './inserted-reserved.js';
import { insertedTexts } from './inserted-texts.js';

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
});

const doc = pagesDocument([
  page([node('paragraph', { dataId: 'p1' }, [documentSchema.text('kept words')])]),
]);
// The position of the paragraph's content, where a widget draws an inserted word.
const at = (() => {
  let found = -1;
  doc.descendants((child, pos) => {
    if (child.type.name === 'paragraph') found = pos + 1;
    return found < 0;
  });
  return found;
})();

const twoPages = pagesDocument([
  page([node('paragraph', { dataId: 'p1' }, [documentSchema.text('first page')])]),
  page([node('paragraph', { dataId: 'p2' }, [documentSchema.text('second page')])]),
]);
// Where the second page's paragraph's content starts.
const second = (() => {
  let found = -1;
  twoPages.descendants((child, pos) => {
    if (child.type.name === 'paragraph' && child.attrs.dataId === 'p2') found = pos + 1;
    return found < 0;
  });
  return found;
})();

describe('inserted words on the pages', () => {
  it('DOCE-PAGINATION-12.4 gives an inserted word the clusters the engine reserves', () => {
    const state = pagesState(doc, stubEngine({ reserved: new Set(['☃']) }));
    expect(insertedReservedBoxes(state, at, 'a☃ ')).toEqual([{ from: 1, to: 2, width: 16 }]);
    // Not in a text block, and without the engine, nothing is reserved.
    expect(insertedReservedBoxes(state, 0, '☃')).toEqual([]);
    const plain = EditorState.create({ doc });
    expect(insertedReservedBoxes(plain, at, '☃')).toEqual([]);
  });

  it('DOCE-PAGINATION-12.4 draws each reserved cluster of a word in its box, the rest as text', () => {
    const nodes = drawReservedText(document, 'a☃b☃', [
      { from: 1, to: 2, width: 16 },
      { from: 3, to: 4, width: 8.5 },
    ]);
    const holder = document.createElement('del');
    holder.append(...nodes);
    expect(holder.innerHTML).toBe(
      'a<span class="de-forced-lines__reserved" style="--de-reserved-width: 16.000px;">☃</span>b' +
        '<span class="de-forced-lines__reserved" style="--de-reserved-width: 8.500px;">☃</span>',
    );
    expect(drawReservedText(document, 'plain', []).map((each) => each.textContent)).toEqual([
      'plain',
    ]);
  });

  it('DOCE-PAGINATION-12.4 draws a comparison’s deleted word with its boxes where the pages draw it', () => {
    const stored = (text: string) =>
      readDocumentFile(
        {
          formatVersion: 1,
          sections: [
            {
              name: null,
              content: [
                { type: 'paragraph', attrs: { id: 'a0000001' }, content: [{ type: 'text', text }] },
              ],
            },
          ],
        } as unknown as DocumentFile,
        documentSchema,
      ).doc;
    const newer = stored('Keep words');
    const deleted = versionChangeDecorations(
      newer,
      compareVersions(stored('Keep sn\u2603w words'), newer),
    )
      .find()
      .find((each) => (each.spec as { insertedText?: string }).insertedText === 'sn\u2603w ');
    if (!deleted) throw new Error('no deleted word');
    const { toDOM } = (
      deleted as unknown as { type: { toDOM: Parameters<typeof Decoration.widget>[1] } }
    ).type;
    // Drawn on the second page, at the position the comparison is mapped to there.
    const set = DecorationSet.create(twoPages, [Decoration.widget(second, toDOM, deleted.spec)]);
    const state = pagesState(twoPages, stubEngine({ reserved: new Set(['\u2603']) }));
    const view = new EditorView(document.createElement('div'), {
      state,
      decorations: (current) => withReservedWords(current, set),
      editable: () => false,
    });
    views.push(view);
    const word = view.dom.querySelector('del');
    // Its text unchanged, each reserved cluster inside a box of it.
    expect(word?.textContent).toBe('sn\u2603w ');
    expect(word?.getAttribute('data-diff-change')).toBe('deletion');
    expect(word?.querySelector('.de-forced-lines__reserved')?.textContent).toBe('\u2603');
    // The boxes are part of the widget's key: a word drawn with other boxes is drawn again.
    const key = (each: DecorationSet) =>
      (each.find()[0]?.spec as { key?: string } | undefined)?.key;
    expect(key(withReservedWords(state, set))).toMatch(/reserved:2:16\.000$/u);
    const wider = pagesState(twoPages, stubEngine({ reserved: new Set(['\u2603', 'n']) }));
    expect(key(withReservedWords(wider, set))).not.toBe(key(withReservedWords(state, set)));
    // The words the engine lays out are read from the specs, not the keys: the same either way.
    const reading = (decorations: DecorationSet) =>
      insertedTexts(
        pagesState(twoPages, stubEngine({ reserved: new Set(['\u2603']) }), [
          new Plugin({ props: { decorations: () => decorations } }),
        ]),
        [forcedLinesKey],
      ).key;
    expect(reading(withReservedWords(state, set))).toBe(reading(set));
    expect(reading(set)).toContain('sn\u2603w ');
    // Without the engine, the set is drawn as it is.
    expect(withReservedWords(EditorState.create({ doc: twoPages }), set)).toBe(set);
  });
});
