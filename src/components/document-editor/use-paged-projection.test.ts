import { renderHook } from '@testing-library/react';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import type { PagedProjection } from '../../pagination/index.js';
import { usePagedEditor } from './use-paged-projection.js';

const { doc, paragraph } = {
  doc: documentSchema.nodes.doc,
  paragraph: documentSchema.nodes.paragraph,
};

function stateOf(text: string) {
  const content = doc?.createAndFill(null, paragraph?.create(null, documentSchema.text(text)));
  if (!content) throw new Error('The schema has no paragraph.');
  return EditorState.create({ doc: content });
}

describe('usePagedEditor', () => {
  it('DOCE-PAGINATION-7.17 takes a transaction the host did not commit back to the state before it, not the state React last drew', () => {
    const drawn = stateOf('Check the unit');
    // The pages have since sent a selection the host has not drawn yet, then a transaction the
    // host takes as an update of its own, as proofing results.
    const selected = drawn.apply(
      drawn.tr.setSelection(TextSelection.create(drawn.doc, 11, drawn.doc.content.size - 1)),
    );
    const tr = selected.tr.setMeta('addToHistory', false);
    const after = selected.apply(tr);
    const update = vi.fn();
    const projection = { state: after, update } as unknown as PagedProjection;
    const onStateChange = vi.fn();
    const { result } = renderHook(() =>
      usePagedEditor({
        state: drawn,
        onStateChange,
        body: (_tr, _view, _commit) => onStateChange(),
        events: {},
      }),
    );
    result.current.targetRef.current = {
      projection,
      host: drawn,
      view: {} as EditorView,
    };
    result.current.onCanonical(tr, { from: selected, to: after });
    expect(update).toHaveBeenCalledWith(selected);
    expect(update).not.toHaveBeenCalledWith(drawn);
  });
});
