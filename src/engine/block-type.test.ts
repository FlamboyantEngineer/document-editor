import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { parseMarkup } from '../../test/document-markup.js';
import { createDocumentSchema, type IdentityAttribute } from '../model/index.js';
import { setTextblockType } from './block-type.js';

const REVIEW: IdentityAttribute = { name: 'review', dom: 'data-review', onCopy: 'clear' };

describe('setTextblockType', () => {
  it('DOCE-EDITING-2.1 keeps a heading identity attributes, the host ones too, across a level change', () => {
    const schema = createDocumentSchema({ schema: { identityAttributes: [REVIEW] } });
    const doc = parseMarkup(
      '<h2 data-id="aaaa0001" data-au="ada" data-review="done" class="custom">Title</h2>',
      schema,
    );
    const heading = schema.nodes.heading;
    if (!heading) throw new Error('No heading type');
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 2) });
    let next = state;
    setTextblockType(heading, { level: 3 })(state, (tr) => {
      next = state.apply(tr);
    });
    expect(next.doc.firstChild?.attrs).toMatchObject({
      level: 3,
      dataId: 'aaaa0001',
      dataAuthor: 'ada',
      review: 'done',
    });
  });
});
