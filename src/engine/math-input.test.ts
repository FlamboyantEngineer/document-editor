import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { documentSchema, findNode } from '../../test/document-markup.js';
import { createDocumentEditing } from './document-editing.js';
import { cancelMathEditing, commitMathEditing, mathEditingAt } from './math-views.js';

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

const { nodes } = documentSchema;

// An editable view of paragraphs of text, or of a code block, with the caret at the end of the first.
function viewOf(texts: readonly string[], code = false): EditorView {
  const blocks = texts.map((text) =>
    (code ? nodes.code_block : nodes.paragraph)?.create(
      null,
      text ? documentSchema.text(text) : null,
    ),
  );
  const doc = documentSchema.topNodeType.createAndFill(
    null,
    blocks.filter((block) => !!block),
  );
  if (!doc) throw new Error('The document is valid');
  const state = EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) });
  const end = (texts[0]?.length ?? 0) + 1;
  view = new EditorView(document.createElement('div'), {
    state: state.apply(state.tr.setSelection(TextSelection.create(state.doc, end))),
  });
  return view;
}

// Types text as the view takes it: each character through the input handlers, or else inserted.
function type(shown: EditorView, text: string): void {
  for (const character of text) {
    const { from, to } = shown.state.selection;
    const insert = () => shown.state.tr.insertText(character, from, to);
    const handled = shown.someProp('handleTextInput', (handle) =>
      handle(shown, from, to, character, insert),
    );
    if (!handled) shown.dispatch(insert());
  }
}

// Presses a key as the view takes it, returning whether a handler took it.
function press(shown: EditorView, key: string, init: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, ...init });
  return Boolean(shown.someProp('handleKeyDown', (handle) => handle(shown, event)));
}

const paragraphText = (shown: EditorView, index: number) =>
  shown.state.doc.child(index).textContent;

describe('math input rules', () => {
  it('DOCE-OBJECTS-1.8 turns LaTeX between dollars into inline math as the closing dollar is typed', () => {
    const shown = viewOf(['Energy is ']);
    type(shown, '$E = mc^2$ here');
    const math = findNode(shown.state.doc, 'math_inline');
    expect(math?.textContent).toBe('E = mc^2');
    expect(paragraphText(shown, 0)).toBe('Energy is E = mc^2 here');
  });

  it('DOCE-OBJECTS-1.8 leaves a closing dollar as text when the LaTeX before it would hold math', () => {
    const math = nodes.math_inline?.create(null, documentSchema.text('x'));
    const paragraph = nodes.paragraph?.create(null, [
      documentSchema.text('Say $a'),
      ...(math ? [math] : []),
      documentSchema.text('b'),
    ]);
    const doc = paragraph && documentSchema.topNodeType.createAndFill(null, [paragraph]);
    if (!doc) throw new Error('The document is valid');
    const state = EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) });
    const end = 1 + (paragraph?.content.size ?? 0);
    view = new EditorView(document.createElement('div'), {
      state: state.apply(state.tr.setSelection(TextSelection.create(state.doc, end))),
    });
    type(view, '$');
    expect(paragraphText(view, 0)).toBe('Say $axb$');
    let count = 0;
    view.state.doc.descendants((node) => {
      if (node.type.name === 'math_inline') count += 1;
    });
    expect(count).toBe(1);
  });

  it('DOCE-OBJECTS-1.8 leaves dollars next to spaces, escaped dollars and dollars in code as text', () => {
    const shown = viewOf(['']);
    type(shown, 'From $5 to $8, \\$x$ or $ y$');
    expect(findNode(shown.state.doc, 'math_inline')).toBeUndefined();
    expect(paragraphText(shown, 0)).toBe('From $5 to $8, \\$x$ or $ y$');
    shown.destroy();
    const code = viewOf(['let a = '], true);
    type(code, '$x$');
    expect(findNode(code.state.doc, 'math_inline')).toBeUndefined();
  });

  it('DOCE-OBJECTS-1.8 turns a paragraph of $$ and LaTeX into display math on Enter, the caret after it', () => {
    const shown = viewOf(['$$a + b$$', 'Next']);
    expect(press(shown, 'Enter')).toBe(true);
    expect(findNode(shown.state.doc, 'math_display')?.textContent).toBe('a + b');
    expect(shown.state.doc.child(1).type.name).toBe('paragraph');
    expect(shown.state.selection.$from.parent).toBe(shown.state.doc.child(1));
    expect(mathEditingAt(shown.state)).toBeNull();
  });

  it('DOCE-OBJECTS-1.8 turns a paragraph of $$ into empty display math, edited in place', () => {
    const shown = viewOf(['$$']);
    expect(press(shown, 'Enter')).toBe(true);
    const editing = mathEditingAt(shown.state);
    expect(editing?.node.type.name).toBe('math_display');
    expect(shown.state.selection).toBeInstanceOf(NodeSelection);
    expect(commitMathEditing('\\sum x')(shown.state, shown.dispatch)).toBe(true);
    expect(findNode(shown.state.doc, 'math_display')?.textContent).toBe('\\sum x');
    expect(mathEditingAt(shown.state)).toBeNull();
    // Enter in other paragraphs splits them as before.
    const plain = viewOf(['$ $']);
    press(plain, 'Enter');
    expect(findNode(plain.state.doc, 'math_display')).toBeUndefined();
    plain.destroy();
  });

  it('DOCE-OBJECTS-1.8 writes the selected text as inline math, or empty math edited in place, with Mod-Alt-L', () => {
    const shown = viewOf(['Area pi r^2']);
    shown.dispatch(shown.state.tr.setSelection(TextSelection.create(shown.state.doc, 6, 12)));
    expect(press(shown, '¬', { code: 'KeyL', ctrlKey: true, altKey: true })).toBe(true);
    expect(findNode(shown.state.doc, 'math_inline')?.textContent).toBe('pi r^2');
    expect(mathEditingAt(shown.state)).toBeNull();
    shown.dispatch(shown.state.tr.setSelection(TextSelection.create(shown.state.doc, 1)));
    expect(press(shown, 'l', { code: 'KeyL', metaKey: true, altKey: true })).toBe(true);
    expect(mathEditingAt(shown.state)?.node.textContent).toBe('');
    // Cancelling math left empty deletes it.
    expect(cancelMathEditing(shown.state, shown.dispatch)).toBe(true);
    expect(mathEditingAt(shown.state)).toBeNull();
    let count = 0;
    shown.state.doc.descendants((node) => {
      if (node.type.name === 'math_inline') count += 1;
    });
    expect(count).toBe(1);
  });
});

describe('math edited in place', () => {
  it('DOCE-OBJECTS-1.8 edits selected math on Enter, kept through changes, and commits or deletes it', () => {
    const shown = viewOf(['Is ']);
    type(shown, '$x$');
    const pos = 4;
    shown.dispatch(shown.state.tr.setSelection(NodeSelection.create(shown.state.doc, pos)));
    expect(press(shown, 'Enter')).toBe(true);
    expect(mathEditingAt(shown.state)?.pos).toBe(pos);
    shown.dispatch(shown.state.tr.insertText('It ', 1));
    expect(mathEditingAt(shown.state)?.pos).toBe(pos + 3);
    // Cancelling keeps the LaTeX it had.
    expect(cancelMathEditing(shown.state, shown.dispatch)).toBe(true);
    expect(findNode(shown.state.doc, 'math_inline')?.textContent).toBe('x');
    expect(commitMathEditing('y')(shown.state, shown.dispatch)).toBe(false);
    shown.dispatch(shown.state.tr.setSelection(NodeSelection.create(shown.state.doc, pos + 3)));
    press(shown, 'Enter');
    expect(commitMathEditing('')(shown.state, shown.dispatch)).toBe(true);
    expect(findNode(shown.state.doc, 'math_inline')).toBeUndefined();
    expect(paragraphText(shown, 0)).toBe('It Is ');
  });
});
