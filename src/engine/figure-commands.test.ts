import { EditorState, NodeSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { pinFigureSnapshot, setFigureSize } from './figure-commands.js';

// A document of one figure with the attributes given, the figure selected.
function figureState(attrs: Record<string, unknown>) {
  const content: StoredNode[] = [
    {
      type: 'figure',
      attrs: { src: 'https://example.com/a.png', ...attrs, width: 40, height: 30 },
    },
  ];
  const { doc } = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content }] },
    documentSchema,
  );
  let pos = -1;
  doc.descendants((node, at) => {
    if (node.type.name === 'figure') pos = at;
    return pos < 0;
  });
  const state = EditorState.create({ doc });
  return state.apply(state.tr.setSelection(NodeSelection.create(doc, pos)));
}

const figureOf = (state: EditorState) => (state.selection as NodeSelection).node.attrs;

describe('setFigureSize', () => {
  it('DOCE-OBJECTS-1.11 sets the size of the figure selected and leaves the fit to the page', () => {
    let state = figureState({ width: 300, height: 150, layout: 'fit-page-width' });
    const command = setFigureSize({ width: 240, height: 120 });
    expect(command(state)).toBe(true);
    command(state, (tr) => {
      state = state.apply(tr);
    });
    expect(figureOf(state)).toMatchObject({ width: 240, height: 120, objectLayout: null });
  });

  it('DOCE-OBJECTS-1.11 keeps an alignment other than the fit', () => {
    let state = figureState({ width: 300, height: 150, layout: 'right' });
    setFigureSize({ width: 100, height: 50 })(state, (tr) => {
      state = state.apply(tr);
    });
    expect(figureOf(state)).toMatchObject({ width: 100, height: 50, objectLayout: 'right' });
  });

  it('DOCE-OBJECTS-1.11 refuses a size below one pixel or not in whole pixels', () => {
    const state = figureState({ width: 300, height: 150 });
    expect(setFigureSize({ width: 0, height: 150 })(state)).toBe(false);
    expect(setFigureSize({ width: 10.5, height: 150 })(state)).toBe(false);
    expect(setFigureSize({ width: 1, height: 1 })(state)).toBe(true);
  });
});

describe('pinFigureSnapshot', () => {
  it('DOCE-HOST-1.15 pins the figures of an asset to its new snapshot, and nothing else', () => {
    let state = figureState({ assetId: 'drawing', assetRevision: 'one', src: '' });
    expect(pinFigureSnapshot({ assetId: 'other', snapshotId: 'two' })(state)).toBe(false);
    pinFigureSnapshot({ assetId: 'drawing', snapshotId: 'two' })(state, (tr) => {
      state = state.apply(tr);
    });
    let snapshot: unknown = null;
    state.doc.descendants((node) => {
      if (node.type.name === 'figure') snapshot = node.attrs.snapshotId;
    });
    expect(snapshot).toBe('two');
    expect(pinFigureSnapshot({ assetId: 'drawing', snapshotId: 'two' })(state)).toBe(false);
  });
});
