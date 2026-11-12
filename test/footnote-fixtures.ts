// Documents with footnotes for the footnote tests: one section on one page, its footnotes' text in
// the page's footnote area, with the footnote plugin installed.

import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { expect } from 'vitest';
import { createFootnotes, type FootnotesOptions } from '../src/engine/footnotes.js';
import { readDocumentFile, type StoredNode } from '../src/model/index.js';
import { documentSchema } from './document-markup.js';

export const text = (value: string, marks?: StoredNode['marks']): StoredNode =>
  marks ? { type: 'text', text: value, marks } : { type: 'text', text: value };

export const note = (id: string, value: string): StoredNode => ({
  type: 'footnote',
  attrs: { id },
  content: [text(value)],
});

export const paragraph = (...content: StoredNode[]): StoredNode => ({ type: 'paragraph', content });

/** An editor state of stored content, with the footnote plugin. */
export function footnoteState(content: StoredNode[], options: FootnotesOptions = {}): EditorState {
  const doc = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content }] },
    documentSchema,
  ).doc;
  return EditorState.create({ doc, plugins: [createFootnotes(options)] });
}

/** The position of a piece of text, plus an offset. */
export function textPos(state: EditorState, value: string, offset = 0): number {
  let found = -1;
  state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(value)) {
      found = pos + node.text.indexOf(value) + offset;
    }
    return found < 0;
  });
  if (found < 0) throw new Error(`No text "${value}"`);
  return found;
}

/** The state with the caret at a piece of text, plus an offset. */
export function caretAt(state: EditorState, value: string, offset = 0): EditorState {
  return state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, textPos(state, value, offset))),
  );
}

/** The state after a command, which must apply. */
export function runCommand(state: EditorState, command: Command): EditorState {
  let next = state;
  expect(command(state, (tr) => (next = next.apply(tr)))).toBe(true);
  return next;
}

/** Each marker and entry in document order, with its id or number and, for an entry, its text. */
export function footnoteParts(state: EditorState, by: 'id' | 'number' = 'id'): string[] {
  const found: string[] = [];
  state.doc.descendants((node) => {
    const name = node.type.name;
    if (name !== 'footnote_reference' && name !== 'footnote_entry') return true;
    const key = String(by === 'id' ? node.attrs.footnoteId : node.attrs.footnoteNumber);
    found.push(name === 'footnote_entry' ? `entry:${key}:${node.textContent}` : `marker:${key}`);
    return false;
  });
  return found;
}
