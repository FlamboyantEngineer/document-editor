import type { Node } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { createVariableTokens } from './index.js';

const read = (...content: StoredNode[]) =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema);

// The end of the first textblock whose text is the one given.
function endOf(doc: Node, text: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isTextblock && node.textContent === text) found = pos + node.nodeSize - 1;
    return found < 0;
  });
  return found;
}

// Types the text at the end of the block whose text is `at`, as a writer would, a key at a time.
function typeInto(block: StoredNode, at: string, typed: string): Node {
  const doc = read(block);
  const state = EditorState.create({ doc, plugins: [createVariableTokens()] });
  const view = new EditorView(document.createElement('div'), {
    state: state.apply(state.tr.setSelection(TextSelection.create(doc, endOf(doc, at)))),
  });
  for (const char of typed) {
    const { from, to } = view.state.selection;
    const handled = view.someProp('handleTextInput', (handle) =>
      handle(view, from, to, char, () => view.state.tr.insertText(char, from, to)),
    );
    if (!handled) view.dispatch(view.state.tr.insertText(char, from, to));
  }
  const result = view.state.doc;
  view.destroy();
  return result;
}

// A textblock's children as text, with each variable as its key in brackets.
function partsOf(doc: Node): string[] {
  const parts: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === 'template_variable') parts.push(`[${String(node.attrs.variableKey)}]`);
    else if (node.isText) parts.push(node.text ?? '');
    return node.type.name !== 'template_variable';
  });
  return parts;
}

describe('variable tokens', () => {
  it('DOCE-TEMPLATES-8.3 turns a typed {{key}} into a variable once its braces close', () => {
    const doc = typeInto(
      { type: 'paragraph', content: [{ type: 'text', text: 'Page' }] },
      'Page',
      ' {{ page.current }} of {{page.total',
    );
    expect(partsOf(doc)).toEqual(['Page ', '[page.current]', ' of {{page.total']);
  });

  it('DOCE-TEMPLATES-8.3 keeps other token forms and code as typed', () => {
    const plain = typeInto({ type: 'paragraph', content: [] }, '', '${name} [[name]]');
    expect(partsOf(plain)).toEqual(['${name} [[name]]']);
    const code = typeInto({ type: 'code_block', content: [] }, '', '{{name}}');
    expect(partsOf(code)).toEqual(['{{name}}']);
  });
});
