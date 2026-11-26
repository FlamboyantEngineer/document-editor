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

// The widths of the figures after inserting one at the start of the first section's content.
function insertFigure(name: string | null, attrs: Record<string, unknown>, remote = false) {
  const state = EditorState.create({
    doc: doc(name),
    plugins: [createFigureDefaults({ template: () => TEMPLATE, isRemote: () => remote })],
  });
  let at = -1;
  state.doc.descendants((node, pos) => {
    if (at < 0 && node.type.name === 'paragraph') at = pos;
  });
  const figure = documentSchema.nodes.figure;
  if (!figure) throw new Error('The schema has figures');
  const next = state.apply(
    state.tr.insert(at, figure.createAndFill(attrs) ?? figure.create(attrs)),
  );
  const widths: unknown[] = [];
  next.doc.descendants((node) => {
    if (node.type === figure) widths.push(node.attrs.width);
  });
  return widths;
}

describe('figure defaults', () => {
  it('DOCE-OBJECTS-1.9 gives a new figure without a size its section default width', () => {
    expect(insertFigure(null, { src: 'a.png' })).toEqual([300]);
    expect(insertFigure('wide', { src: 'a.png' })).toEqual([576]);
    expect(insertFigure(null, { src: 'a.png', width: 120 })).toEqual([120]);
    expect(insertFigure(null, { src: 'a.png' }, true)).toEqual([null]);
  });

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
