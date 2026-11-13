import { Node } from 'prosemirror-model';
import { EditorState, type Plugin } from 'prosemirror-state';
import type { DecorationSet } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  BASE_TEMPLATE,
  readDocumentFile,
  type StoredNode,
  type TemplateFile,
} from '../model/index.js';
import { createCustomStyles } from './custom-styles.js';
import { createDocumentSections } from './document-sections.js';
import { createDynamicTemplates } from './dynamic-templates.js';

// The keystroke hot path: plugins whose state follows the whole document skip walking it for a
// change that only types text.

const paragraph = (value: string): StoredNode => ({
  type: 'paragraph',
  content: value ? [{ type: 'text', text: value }] : [],
});

const TEMPLATE: TemplateFile = {
  ...BASE_TEMPLATE,
  styles: { ...BASE_TEMPLATE.styles, custom: { note: { italic: true } } },
  sections: [{ name: 'appendix', placeholder: [paragraph('Write the appendix')] }],
};

const READ = readDocumentFile(
  {
    formatVersion: 1,
    sections: [
      {
        name: null,
        content: [
          paragraph('Plain text'),
          { type: 'templateBlock', attrs: { source: '<p>Block</p>' } },
          paragraph('Noted'),
        ],
      },
      { name: 'appendix', content: [paragraph('')] },
    ],
  },
  documentSchema,
).doc;

const positionOf = (doc: Node, value: string) => {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text === value) found = pos;
  });
  return found;
};

// The second paragraph in the custom style.
const DOC = EditorState.create({ doc: READ }).apply(
  EditorState.create({ doc: READ }).tr.setNodeAttribute(
    positionOf(READ, 'Noted') - 1,
    'className',
    'note',
  ),
).doc;

const PLUGINS = (): Plugin[] => [
  createCustomStyles({ template: () => TEMPLATE }),
  createDocumentSections({ template: () => TEMPLATE }),
  createDynamicTemplates(),
];

// Counts the walks over the document and its sections while a change applies.
function walksDuring(state: EditorState, change: (state: EditorState) => EditorState) {
  const walked = (node: Node) => node.type.name === 'doc' || node.type.name === 'page_section';
  const descendants = vi.spyOn(Node.prototype, 'descendants');
  const forEach = vi.spyOn(Node.prototype, 'forEach');
  const next = change(state);
  const count = [...descendants.mock.contexts, ...forEach.mock.contexts].filter((node) =>
    walked(node as Node),
  ).length;
  descendants.mockRestore();
  forEach.mockRestore();
  return { next, count };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('keystroke hot path', () => {
  it('DOCE-EDITING-3.4 types text without walking the document for custom styles, sections and template blocks', () => {
    const state = EditorState.create({ doc: DOC, plugins: PLUGINS() });
    const at = positionOf(DOC, 'Noted') + 2;
    const { next, count } = walksDuring(state, (from) =>
      from.apply(from.tr.insertText('x', at).insertText('y', at + 1)),
    );
    expect(count).toBe(0);
    const fresh = EditorState.create({ doc: next.doc, plugins: PLUGINS() });
    for (const plugin of fresh.plugins) {
      const kept = (plugin.getState(next) as DecorationSet).find();
      const built = (plugin.getState(fresh) as DecorationSet).find();
      expect(kept.map((each) => [each.from, each.to])).toEqual(
        built.map((each) => [each.from, each.to]),
      );
    }
  });

  it('DOCE-EDITING-3.4 walks the document again for a change that is not only text', () => {
    const state = EditorState.create({ doc: DOC, plugins: PLUGINS() });
    const at = positionOf(DOC, 'Plain text') + 5;
    expect(walksDuring(state, (from) => from.apply(from.tr.split(at))).count).toBeGreaterThan(0);
  });

  it('DOCE-EDITING-3.4 redraws a section placeholder when typing fills or empties its block', () => {
    const state = EditorState.create({ doc: DOC, plugins: PLUGINS() });
    const sections = state.plugins[1];
    const placeholders = (current: EditorState) =>
      (sections?.getState(current) as DecorationSet)
        .find()
        .filter((decoration) =>
          String((decoration.spec as { key?: string }).key).startsWith('placeholder'),
        );
    const appendix = DOC.child(0).nodeSize;
    let blockAt = -1;
    DOC.nodesBetween(appendix, DOC.content.size, (node, pos) => {
      if (blockAt < 0 && node.type.name === 'paragraph') blockAt = pos;
    });
    expect(placeholders(state)).toHaveLength(1);
    const typed = state.apply(state.tr.insertText('A', blockAt + 1));
    expect(placeholders(typed)).toHaveLength(0);
    const cleared = typed.apply(typed.tr.delete(blockAt + 1, blockAt + 2));
    expect(placeholders(cleared)).toHaveLength(1);
  });
});
