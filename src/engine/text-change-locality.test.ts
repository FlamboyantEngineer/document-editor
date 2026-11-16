import type { Fragment, Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { afterEach, describe, expect, it } from 'vitest';
import { BASE_TEMPLATE, createDocumentSchema, readDocumentFile } from '../model/index.js';
import {
  assignElementIds,
  createContents,
  createDocumentEditing,
  createPresence,
} from './index.js';

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

// A document of three sections of twenty paragraphs each.
function editorState() {
  const schema = createDocumentSchema();
  const sections = ['A', 'B', 'C'].map((name) => ({
    content: Array.from({ length: 20 }, (_, index) => paragraph(`${name} ${String(index)}`)),
  }));
  const state = EditorState.create({
    doc: readDocumentFile({ formatVersion: 1, sections }, schema).doc,
    plugins: [
      createContents({ template: () => BASE_TEMPLATE }),
      createPresence(),
      ...createDocumentEditing(schema, { template: () => BASE_TEMPLATE, author: () => 'writer' }),
    ],
  });
  const tr = state.tr;
  assignElementIds(tr, {});
  return state.apply(tr);
}

// Walks of a section's content: its children, descendants or a range of them, recorded by name.
const walks: string[] = [];
const trapped: Fragment[] = [];

function trap(section: ProseMirrorNode): void {
  const { content } = section;
  trapped.push(content);
  for (const method of ['forEach', 'nodesBetween', 'descendants'] as const) {
    const own = content[method] as (...args: never[]) => unknown;
    Object.defineProperty(content, method, {
      configurable: true,
      value: (...args: never[]) => {
        walks.push(method);
        return own.apply(content, args);
      },
    });
  }
}

afterEach(() => {
  for (const content of trapped.splice(0)) {
    for (const method of ['forEach', 'nodesBetween', 'descendants']) {
      Reflect.deleteProperty(content, method);
    }
  }
  walks.length = 0;
});

describe('a text-only change', () => {
  it('DOCE-LABS-2.3 walks no section it does not change, through every editing plugin', () => {
    const state = editorState();
    const [first, second, third] = [0, 1, 2].map((index) => state.doc.child(index));
    if (!first || !second || !third) throw new Error('Three sections');
    let at = -1;
    state.doc.descendants((node, pos) => {
      if (at < 0 && node.isTextblock && node.textContent === 'A 3') at = pos + 1;
      return at < 0;
    });
    trap(second);
    trap(third);
    const next = state.apply(state.tr.insertText('typed ', at));
    expect(next.doc.child(1)).toBe(second);
    expect(walks).toEqual([]);
    // The trap catches a walk of the whole document.
    next.doc.descendants(() => true);
    expect(walks).toContain('nodesBetween');
  });
});
