import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { BASE_TEMPLATE, readDocumentFile, type TemplateFile } from '../model/index.js';
import { createFigureDefaults, newFigureSize } from './figure-defaults.js';

const TEMPLATE: TemplateFile = {
  ...BASE_TEMPLATE,
  styles: { ...BASE_TEMPLATE.styles, figure: { defaultWidth: '300px' } },
  sections: [{ name: 'wide', styles: { figure: { defaultWidth: '6in' } } }],
};

const doc = (name: string | null) =>
  readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        { name, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] },
      ],
    },
    documentSchema,
  ).doc;

describe('figure defaults', () => {
  it('DOCE-OBJECTS-1.9 sizes a new figure of an image of a natural size at its section default width, in its proportions', () => {
    const plugins = [createFigureDefaults({ template: () => TEMPLATE })];
    const natural = { width: 800, height: 400 };
    const plain = EditorState.create({ doc: doc(null), plugins });
    expect(newFigureSize(plain, 1, natural)).toEqual({ width: 300, height: 150 });
    const wide = EditorState.create({ doc: doc('wide'), plugins });
    expect(newFigureSize(wide, 1, natural)).toEqual({ width: 576, height: 288 });
    const none = { ...TEMPLATE, styles: { ...BASE_TEMPLATE.styles, figure: {} }, sections: [] };
    const bare = EditorState.create({
      doc: doc(null),
      plugins: [createFigureDefaults({ template: () => none })],
    });
    expect(newFigureSize(bare, 1, natural)).toEqual(natural);
    expect(newFigureSize(EditorState.create({ doc: doc(null) }), 1, natural)).toEqual(natural);
  });
});
