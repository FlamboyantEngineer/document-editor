import type { Node } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { EDITOR_VARIABLES, insertVariable, variableCatalog } from './index.js';

const text = (value: string): StoredNode => ({ type: 'text', text: value });

const read = (...content: StoredNode[]) =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema).doc;

// The position of a text in a document, plus an offset into it.
function at(doc: Node, value: string, offset = 0): number {
  let found = -1;
  doc.descendants((node, pos) => {
    const index = node.isText ? (node.text ?? '').indexOf(value) : -1;
    if (found < 0 && index >= 0) found = pos + index + offset;
    return found < 0;
  });
  return found;
}

// A state over the blocks with the text from one place to another selected.
function stateOf(blocks: StoredNode[], from: [string, number], to = from) {
  const doc = read(...blocks);
  const state = EditorState.create({ doc });
  const selection = TextSelection.create(doc, at(doc, ...from), at(doc, ...to));
  return state.apply(state.tr.setSelection(selection));
}

// The run of a doc's first textblock: its text, with each variable as its key in brackets.
function runOf(doc: Node): string {
  let run = '';
  doc.descendants((node) => {
    if (node.type.name === 'template_variable') run += `[${String(node.attrs.variableKey)}]`;
    else if (node.isText) run += node.text ?? '';
    return node.type.name !== 'template_variable';
  });
  return run;
}

function run(state: EditorState, key: string): EditorState | null {
  let next: EditorState | null = null;
  const ran = insertVariable(key)(state, (tr) => {
    next = state.apply(tr);
  });
  return ran ? next : null;
}

describe('variable catalog', () => {
  it("DOCE-TEMPLATES-8.4 lists the editor's own variables, then the host's not listed before", () => {
    const catalog = variableCatalog(
      (key) => `label of ${key}`,
      [
        { key: 'document.name', label: 'Document name' },
        { key: 'page.total', label: 'Pages' },
        { key: 'document.name', label: 'Again' },
        { key: 'document.revision', label: 'Revision' },
      ],
    );
    expect(catalog).toEqual([
      ...EDITOR_VARIABLES.map((key) => ({ key, label: `label of ${key}` })),
      { key: 'document.name', label: 'Document name' },
      { key: 'document.revision', label: 'Revision' },
    ]);
    expect(variableCatalog((key) => key).map((entry) => entry.key)).toEqual([
      'page.current',
      'page.total',
      'date.current',
    ]);
  });
});

describe('inserting a variable', () => {
  it('DOCE-TEMPLATES-8.5 puts a live variable in place of the selection, the caret after it', () => {
    const state = stateOf(
      [{ type: 'paragraph', content: [text('Page X of all')] }],
      ['X', 0],
      ['X', 1],
    );
    const next = run(state, 'page.current');
    expect(next && runOf(next.doc)).toBe('Page [page.current] of all');
    const caret = next?.selection.$from;
    expect(caret?.nodeBefore?.type.name).toBe('template_variable');
    expect(caret?.nodeAfter?.text).toBe(' of all');
  });

  it('DOCE-TEMPLATES-8.5 refuses a key no token holds, code, a selection across blocks', () => {
    const paragraph = { type: 'paragraph', content: [text('First')] };
    const plain = stateOf([paragraph], ['First', 2]);
    expect(run(plain, 'document.name')).not.toBeNull();
    expect(run(plain, '9 lives')).toBeNull();
    expect(run(plain, '')).toBeNull();
    const code = stateOf([{ type: 'codeBlock', content: [text('let a = 1;')] }], ['a', 0]);
    expect(run(code, 'page.current')).toBeNull();
    const across = stateOf(
      [paragraph, { type: 'paragraph', content: [text('Second')] }],
      ['First', 1],
      ['Second', 1],
    );
    expect(run(across, 'page.current')).toBeNull();
  });
});
