import * as Y from '@y/y';
import { EditorState } from 'prosemirror-state';
import { expect, it } from 'vitest';
import { documentSchema as schema } from '../../test/document-markup.js';
import type { DocumentFile } from '../model/index.js';
import { writeRoomDocument } from './convert.js';
import { readContent } from './delta.js';
import { diffNodes } from './diff.js';
import { createGuardPositions } from './guard-positions.js';
import { fromRelativeJSON, toRelativeJSON } from './relative-positions.js';

const file: DocumentFile = {
  formatVersion: 1,
  sections: [
    {
      name: null,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'A😀B' },
            { type: 'lineBreak' },
            { type: 'text', text: 'End' },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested' }] }],
            },
          ],
        },
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }],
                },
              ],
            },
          ],
        },
        { type: 'paragraph' },
      ],
    },
  ],
};

it('DOCE-COLLAB-7.2 batches the same relative anchors at every boundary, UTF-16 character and nested/leaf node', () => {
  const doc = new Y.Doc();
  writeRoomDocument(doc, file, { schema });
  const type = doc.get('content');
  const content = readContent(schema, type);
  if (!content) throw new Error('Missing content.');
  content.check();
  const types: string[] = [];
  content.descendants((node) => {
    types.push(node.type.name);
  });
  expect(types).toEqual(
    expect.arrayContaining([
      'hard_break',
      'bullet_list',
      'list_item',
      'table',
      'table_row',
      'table_cell',
    ]),
  );
  expect(types).not.toContain('unknown_block');
  const positions = createGuardPositions(type, content);
  const anchors: unknown[] = [];
  for (let pos = 0; pos <= content.content.size; pos++) {
    const relative = positions.toRelativeJSON(pos);
    expect(relative).toEqual(toRelativeJSON(type, content, pos));
    expect(positions.fromRelativeJSON(relative)).toBe(fromRelativeJSON(type, content, relative));
    anchors.push(relative);
  }
  let at = 0;
  content.descendants((node, pos) => {
    if (!at && node.isText) at = pos;
  });
  const next = EditorState.create({ doc: content }).tr.insertText('Added ', at).doc;
  type.applyDelta(diffNodes(content, next) as never);
  const after = createGuardPositions(type, next);
  for (const anchor of anchors)
    expect(after.fromRelativeJSON(anchor)).toBe(fromRelativeJSON(type, next, anchor));
  const unrelated = doc.get('other');
  unrelated.insert(0, 'Other');
  expect(
    after.fromRelativeJSON(
      Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(unrelated, 1)),
    ),
  ).toBeNull();
  doc.destroy();
});
