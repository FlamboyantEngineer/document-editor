import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile } from '../model/index.js';
import { followDocument } from './ghost-view.js';

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

// Two sections of two paragraphs each, every section on one page.
function twoSections() {
  const sections = [
    { content: [paragraph('One'), paragraph('Two')] },
    { content: [paragraph('Three'), paragraph('Four')] },
  ];
  return readDocumentFile({ formatVersion: 1, sections }, documentSchema).doc;
}

function blocks(doc: ProseMirrorNode): ProseMirrorNode[] {
  const found: ProseMirrorNode[] = [];
  doc.descendants((node) => {
    if (node.type.name === 'paragraph') found.push(node);
    return node.type.name !== 'paragraph';
  });
  return found;
}

function nodePos(doc: ProseMirrorNode, name: string, nth: number): number {
  const found: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === name) found.push(pos);
  });
  return found[nth] ?? -1;
}

describe('followDocument', () => {
  it('DOCE-PAGINATION-5.13 keeps every node a change does not reach, past page numbers that changed', () => {
    const doc = twoSections();
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc }),
    });
    const before = blocks(view.state.doc);
    // A copy, as a fresh join gives: the first section's header numbered anew, a paragraph added
    // to the second section, and the first section's blocks equal but not the same nodes.
    const tr = EditorState.create({ doc }).tr;
    const header = nodePos(doc, 'page_header', 0);
    tr.setNodeAttribute(header, 'totalPages', 9);
    tr.insertText('!', nodePos(tr.doc, 'paragraph', 3) + 5);
    const copy = documentSchema.nodeFromJSON(tr.doc.toJSON());
    followDocument(view, copy);
    const after = blocks(view.state.doc);
    expect(view.state.doc.eq(copy)).toBe(true);
    expect(after.slice(0, 3)).toEqual(before.slice(0, 3));
    after.slice(0, 3).forEach((node, index) => expect(node).toBe(before[index]));
    expect(after[3]?.textContent).toBe('Four!');
    view.destroy();
  });

  it('DOCE-PAGINATION-5.13 follows a document with blocks added and taken away', () => {
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc: twoSections() }),
    });
    const one = readDocumentFile(
      {
        formatVersion: 1,
        sections: [{ content: [paragraph('One'), paragraph('Five'), paragraph('Six')] }],
      },
      documentSchema,
    ).doc;
    followDocument(view, one);
    expect(view.state.doc.eq(one)).toBe(true);
    view.destroy();
  });
});
