import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile } from '../model/index.js';
import { insertTemplateImage } from './template-images.js';

function stateAt(offset: number) {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Logo' }] },
            { type: 'horizontal_rule' },
          ],
        },
      ],
    },
    documentSchema,
  ).doc;
  let start = -1;
  doc.descendants((node, pos) => {
    if (start < 0 && node.isTextblock) start = pos + 1;
    return start < 0;
  });
  const state = EditorState.create({ doc });
  return state.apply(state.tr.setSelection(TextSelection.create(doc, start + offset)));
}

describe('placing an image asset in template content', () => {
  it('DOCE-TEMPLATE-EDITOR-3.17 places an asset as a template image, shrunk to fit', () => {
    let state = stateAt(4);
    const command = insertTemplateImage({
      id: 'logo',
      snapshotId: 'logo@2',
      name: 'Logo',
      mediaType: 'image/png',
      width: 320,
      height: 96,
    });
    expect(command(state, (tr) => (state = state.apply(tr)))).toBe(true);
    let image: Record<string, unknown> | null = null;
    state.doc.descendants((node) => {
      if (node.type.name === 'image') image = node.attrs;
    });
    expect(image).toMatchObject({
      templateAssetImage: true,
      templateFileId: 'logo',
      templateSnapshotId: 'logo@2',
      templateImageName: 'Logo',
      templateImageMimeType: 'image/png',
      templateImageWidth: 160,
      templateImageHeight: 48,
      templateImageNaturalWidth: 320,
      src: '',
    });
  });

  it('DOCE-TEMPLATE-EDITOR-3.17 keeps a small image at its own size and names its snapshot', () => {
    let state = stateAt(0);
    insertTemplateImage({
      id: 'icon',
      name: 'Icon',
      mediaType: 'image/svg+xml',
      width: 24,
      height: 24,
    })(state, (tr) => (state = state.apply(tr)));
    let attrs: Record<string, unknown> = {};
    state.doc.descendants((node) => {
      if (node.type.name === 'image') attrs = node.attrs;
    });
    expect(attrs).toMatchObject({ templateImageWidth: 24, templateSnapshotId: 'icon' });
  });

  it('DOCE-TEMPLATE-EDITOR-3.17 cannot run where no inline content goes', () => {
    const state = stateAt(0);
    const { doc } = state;
    let rule = -1;
    doc.descendants((node, pos) => {
      if (node.type.name === 'horizontal_rule') rule = pos;
    });
    const onRule = state.apply(state.tr.setSelection(NodeSelection.create(doc, rule)));
    const placed = insertTemplateImage({ id: 'x', name: 'x', mediaType: 'image/png' });
    expect(placed(onRule)).toBe(false);
    expect(placed(state)).toBe(true);
  });
});
