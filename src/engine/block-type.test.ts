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

  it('DOCE-EDITING-2.1 restyles every paragraph and heading in the selection, and leaves a code block be', () => {
    const doc = parseMarkup(
      '<p data-id="aaaa0001">One</p><pre data-id="aaaa0002"><code>x = 1</code></pre><h3 data-id="aaaa0003">Two</h3>',
    );
    const heading = doc.type.schema.nodes.heading;
    if (!heading) throw new Error('No heading type');
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 2, doc.content.size - 2),
    });
    let next = state;
    expect(
      setTextblockType(heading, { level: 2 })(state, (tr) => {
        next = state.apply(tr);
      }),
    ).toBe(true);
    const blocks: [string, unknown, unknown][] = [];
    next.doc.forEach((node) => {
      // A code block is held after its caption, which is no paragraph or heading to restyle.
      const block = node.type.name === 'code_figure' ? (node.lastChild ?? node) : node;
      blocks.push([block.type.name, block.attrs.level, block.attrs.dataId]);
    });
    expect(blocks).toEqual([
      ['heading', 2, 'aaaa0001'],
      ['code_block', undefined, 'aaaa0002'],
      ['heading', 2, 'aaaa0003'],
    ]);
    // A selection of only a code block has nothing to restyle.
    const code = EditorState.create({ doc, selection: TextSelection.create(doc, 10) });
    expect(setTextblockType(heading, { level: 2 })(code)).toBe(false);
  });
});
