import userEvent from '@testing-library/user-event';
import { Schema } from 'prosemirror-model';
import { EditorState, NodeSelection, type Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { documentSchema, findNode } from '../../test/document-markup.js';
import { installEditorDom } from '../../test/editor-dom.js';
import { createObjectViews } from './object-views.js';

installEditorDom();

let view: EditorView | null = null;

// Whether the view's plugins keep typed text from replacing the selection.
const keepsSelection = (shown: EditorView) =>
  Boolean(
    shown.someProp('handleTextInput', (handle) =>
      handle(
        shown,
        shown.state.selection.from,
        shown.state.selection.to,
        'y',
        () => shown.state.tr,
      ),
    ),
  );

afterEach(() => {
  view?.destroy();
  view = null;
});

// A view of the document, focused, with the object at a position selected.
function viewSelecting(state: EditorState, pos: number, plugins: Plugin[] = []): EditorView {
  const place = document.createElement('div');
  document.body.appendChild(place);
  const selected = EditorState.create({
    doc: state.doc,
    plugins: [createObjectViews(), ...plugins],
  });
  view = new EditorView(place, {
    state: selected.apply(selected.tr.setSelection(NodeSelection.create(selected.doc, pos))),
  });
  view.focus();
  return view;
}

const { nodes } = documentSchema;

describe('typing over a selected object', () => {
  it('DOCE-OBJECTS-1.2 leaves selected linked code when the writer types', async () => {
    const user = userEvent.setup();
    const linked = nodes.linked_code_block?.create({ url: 'https://example.com/a.ts', code: 'a' });
    const paragraph = nodes.paragraph?.create(null, documentSchema.text('After'));
    if (!linked || !paragraph) throw new Error('The schema has linked code and paragraphs');
    const doc = documentSchema.topNodeType.createAndFill(null, [linked, paragraph]);
    if (!doc) throw new Error('The document is valid');
    const shown = viewSelecting(EditorState.create({ doc }), 0);
    await user.keyboard('x');
    expect(findNode(shown.state.doc, 'linked_code_block')).toBeDefined();
    expect(shown.state.doc.textContent).toBe('After');
  });

  it('DOCE-OBJECTS-1.2 lets typing replace a selected inline object, and a block whose type replaces on typing', () => {
    const math = nodes.math_inline?.create(null, documentSchema.text('x^2'));
    const paragraph = math && nodes.paragraph?.create(null, [documentSchema.text('Is '), math]);
    const doc = paragraph && documentSchema.topNodeType.createAndFill(null, [paragraph]);
    if (!doc) throw new Error('The document is valid');
    expect(keepsSelection(viewSelecting(EditorState.create({ doc }), 4))).toBe(false);
    view?.destroy();

    const schema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: { group: 'block', content: 'text*', toDOM: () => ['p', 0] },
        marker: { group: 'block', atom: true, replaceOnType: true, toDOM: () => ['hr'] },
        text: {},
      },
    });
    const marked = schema.node('doc', null, [schema.node('marker'), schema.node('paragraph')]);
    expect(keepsSelection(viewSelecting(EditorState.create({ doc: marked }), 0))).toBe(false);
  });
});
