import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import type { Transform } from 'prosemirror-transform';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import {
  BASE_TEMPLATE,
  catalogDocument,
  DEFAULT_CONTENTS_KINDS,
  readDocumentFile,
  type StoredNode,
} from '../index.js';
import { deriveCatalog } from './catalog-derive.js';

const text = (value: string): StoredNode => ({ type: 'text', text: value });
const heading = (level: number, value: string): StoredNode => ({
  type: 'heading',
  attrs: { level },
  content: [text(value)],
});
const paragraph = (value: string): StoredNode => ({ type: 'paragraph', content: [text(value)] });

const doc = readDocumentFile(
  {
    formatVersion: 1,
    sections: [
      {
        name: null,
        content: [
          { type: 'contents', attrs: { kind: 'toc' } },
          heading(1, 'Scope'),
          paragraph('Body text'),
          heading(2, 'Purpose'),
          {
            type: 'paragraph',
            content: [
              text('Uses '),
              { type: 'abbreviation', attrs: { entry: 'ac', abbreviation: 'AC' } },
            ],
          },
        ],
      },
    ],
  },
  documentSchema,
).doc;

// The position just inside the first textblock whose text is the given text.
function inside(value: string) {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isTextblock && node.textContent === value) found = pos + 1;
    return found < 0;
  });
  return found;
}

// The change a transform makes, as the catalog follows it.
const changeOf = (tr: Transform) => ({
  docs: tr.docs,
  steps: tr.steps,
  mapping: tr.mapping,
  doc: tr.doc,
});

const derive = (tr: Transform) =>
  deriveCatalog(catalogDocument(doc, BASE_TEMPLATE), changeOf(tr), DEFAULT_CONTENTS_KINDS);

const counted = (next: ProseMirrorNode) => catalogDocument(next, BASE_TEMPLATE);

describe('catalog derivation', () => {
  it('DOCE-CONTENTS-2.9 follows a text edit in a heading or a paragraph without counting', () => {
    const tr = EditorState.create({ doc })
      .tr.insertText(' and limits', inside('Scope') + 5)
      .insertText('More ', inside('Body text'));
    expect(derive(tr)).toEqual(counted(tr.doc));
    const deleted = EditorState.create({ doc }).tr.delete(inside('Purpose'), inside('Purpose') + 3);
    expect(derive(deleted)).toEqual(counted(deleted.doc));
  });

  it('DOCE-CONTENTS-2.9 counts again for a change that could move numbers or listings', () => {
    const level = EditorState.create({ doc }).tr.setNodeMarkup(inside('Purpose') - 1, undefined, {
      level: 1,
    });
    expect(derive(level)).toBeNull();
    const split = EditorState.create({ doc }).tr.split(inside('Body text') + 4);
    expect(derive(split)).toBeNull();
    // A block that holds an inline node a kind lists.
    const abbreviated = EditorState.create({ doc }).tr.insertText('also ', inside('Uses ') + 5);
    expect(derive(abbreviated)).toBeNull();
    const emptied = EditorState.create({ doc }).tr.delete(inside('Scope'), inside('Scope') + 5);
    expect(derive(emptied)).toEqual(counted(emptied.doc));
  });
});
