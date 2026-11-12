import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { createMemoryHost } from '../../host/index.js';
import { readDocumentFile } from '../../model/index.js';
import { figurePasteHandlers } from './figure-paste.js';

function editorView() {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content: [{ type: 'paragraph' }] }] },
    documentSchema,
  ).doc;
  const state = EditorState.create({ doc });
  return new EditorView(document.createElement('div'), {
    state: state.apply(state.tr.setSelection(TextSelection.atStart(doc))),
  });
}

// A paste carrying the given files, as the clipboard hands them to the view's handler.
function pasteOf(files: File[]) {
  return {
    clipboardData: { files } as unknown as DataTransfer,
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent;
}

describe('figurePasteHandlers', () => {
  it('DOCE-EDITOR-4.6 inserts every pasted image as its own figure, in order', async () => {
    const view = editorView();
    const { assets } = createMemoryHost();
    if (!assets) throw new Error('The memory host stores assets.');
    const handlers = figurePasteHandlers({ assets, failure: 'The image could not be uploaded.' });
    const images = ['one.png', 'two.png', 'three.png'].map(
      (name) => new File(['image'], name, { type: 'image/png' }),
    );
    expect(handlers.handlePaste(view, pasteOf(images))).toBe(true);
    await vi.waitFor(() => {
      const alts: unknown[] = [];
      view.state.doc.descendants((node) => {
        if (node.type.name === 'figure') alts.push(node.attrs.alt);
      });
      expect(alts).toEqual(['one.png', 'two.png', 'three.png']);
    });
    view.destroy();
  });
});
