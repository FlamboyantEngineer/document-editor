import { EditorState } from 'prosemirror-state';
import { StepMap } from 'prosemirror-transform';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile } from '../model/index.js';
import { changedRanges } from './changed-ranges.js';

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

function stateOf(count: number) {
  const content = Array.from({ length: count }, (_, index) => paragraph(`Block ${String(index)}`));
  const { doc } = readDocumentFile({ formatVersion: 1, sections: [{ content }] }, documentSchema);
  return EditorState.create({ doc });
}

// The position of each paragraph in a document.
function paragraphs(state: EditorState): number[] {
  const found: number[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') found.push(pos);
    return node.type.name !== 'paragraph';
  });
  return found;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('changedRanges', () => {
  it('DOCE-LABS-2.3 maps a range only through the later steps that move positions', () => {
    const state = stateOf(400);
    const tr = state.tr;
    for (const pos of paragraphs(state)) tr.setNodeAttribute(pos, 'dataId', null);
    for (const pos of paragraphs(state)) tr.setNodeMarkup(pos, undefined, { dataId: null });
    const mapped = vi.spyOn(StepMap.prototype, 'map');
    const ranges = changedRanges([tr]);
    // Neither an attribute's step nor a node's markup moves a position: nothing is mapped.
    expect(mapped).not.toHaveBeenCalled();
    expect(ranges).toHaveLength(400 + 800);
  });

  it('DOCE-LABS-2.3 still maps a range through a later step that inserts or deletes', () => {
    const state = stateOf(3);
    const [first = 0, second = 0] = paragraphs(state);
    const tr = state.tr.setNodeAttribute(second, 'dataId', null);
    tr.insertText('ab', first + 1);
    tr.setNodeMarkup(first, undefined, { dataId: null });
    tr.delete(first + 1, first + 2);
    const ranges = changedRanges([tr]);
    // The attribute step's node moved two forward with the insert and one back with the delete.
    expect(ranges[0]).toEqual({ from: second + 1, to: second + 2 });
    expect(ranges.at(-1)).toEqual({ from: first + 1, to: first + 1 });
  });
});
