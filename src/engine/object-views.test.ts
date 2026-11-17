import { userEvent } from '@testing-library/user-event';
import { Schema } from 'prosemirror-model';
import { EditorState, NodeSelection, type Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { documentSchema, findNode } from '../../test/document-markup.js';
import { installEditorDom } from '../../test/editor-dom.js';
import { createDocumentEditing } from './document-editing.js';
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
    const { doc: typed } = shown.state;
    expect(typed.textBetween(0, typed.content.size)).toBe('After');
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

// The numbers a code element's gutter shows, and the line text each copies.
const gutterLines = (element: Element | null | undefined) =>
  [...(element?.querySelectorAll('.de-code-gutter__line') ?? [])].map((line) => [
    line.querySelector('.de-code-gutter__number')?.textContent,
    line.querySelector('.de-code-gutter__text')?.textContent,
  ]);

describe('line numbers', () => {
  it('DOCE-OBJECTS-3.1 numbers authored code from its first line once the view is built, and a new line at once', () => {
    const code = nodes.code_block?.create(null, documentSchema.text('let a = 1;\nlet b = 2;'));
    const later = nodes.code_block?.create(
      { codeBlockContinued: true, codeLineStart: 99 },
      documentSchema.text('x\ny'),
    );
    if (!code || !later) throw new Error('The schema has code blocks');
    const doc = documentSchema.topNodeType.createAndFill(null, [code, later]);
    if (!doc) throw new Error('The document is valid');
    view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc, plugins: [createObjectViews()] }),
    });
    const [first, second] = [...view.dom.querySelectorAll('pre')];
    // Filled as the view is built, before any frame, with one code element for the text.
    expect(gutterLines(first)).toEqual([
      ['1', 'let a = 1;'],
      ['2', 'let b = 2;'],
    ]);
    expect(first?.querySelectorAll('code')).toHaveLength(1);
    expect(first?.querySelector('code')?.textContent).toBe('let a = 1;\nlet b = 2;');
    expect(first?.style.getPropertyValue('--de-code-gutter-digits')).toBe('3');
    expect(gutterLines(second).map(([number]) => number)).toEqual(['99', '100']);
    // A line break typed adds its number in the same update, before the browser paints.
    view.dispatch(view.state.tr.insertText('\n', 11));
    expect(gutterLines(view.dom.querySelector('pre'))).toEqual([
      ['1', 'let a = 1;'],
      ['2', ''],
      ['3', 'let b = 2;'],
    ]);
  });

  it('DOCE-OBJECTS-3.1 numbers only linked code, or none, when the editing plugins are asked to', () => {
    const code = nodes.code_block?.create(null, documentSchema.text('a'));
    const linked = nodes.linked_code_block?.create({ code: 'b\nc', startLine: 7 });
    if (!code || !linked) throw new Error('The schema has code and linked code');
    const doc = documentSchema.topNodeType.createAndFill(null, [code, linked]);
    if (!doc) throw new Error('The document is valid');
    view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc, plugins: [createObjectViews({ lineNumbers: 'linked' })] }),
    });
    const [authored, linkedPre] = [...view.dom.querySelectorAll('pre')];
    expect(authored?.querySelector('.de-code-gutter')).toBeNull();
    expect(gutterLines(linkedPre)).toEqual([
      ['7', 'b'],
      ['8', 'c'],
    ]);
    view.destroy();
    const plugins = createDocumentEditing(documentSchema, { lineNumbers: 'none' });
    view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc, plugins }),
    });
    expect(view.dom.querySelectorAll('.de-code-gutter')).toHaveLength(0);
  });
});
