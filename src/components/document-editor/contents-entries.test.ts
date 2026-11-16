import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import { EditorState, NodeSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { createContents } from '../../engine/index.js';
import { BASE_TEMPLATE, readDocumentFile } from '../../model/index.js';
import { contentsEntries } from './contents-entries.js';
import { DEFAULT_EDITOR_LABELS } from './editor-labels.js';

// A list of references after a citation of a catalogue entry, with the list selected.
function referencesView() {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            { type: 'contents', attrs: { kind: 'references' } },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'the entry',
                  marks: [
                    {
                      type: 'reference',
                      attrs: { referenceType: 'catalogue-entry', number: 'C-1', target: 'c1' },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    documentSchema,
  ).doc;
  let list = 0;
  doc.descendants((node, pos) => {
    if (node.type.name === 'toc_block') list = pos;
  });
  const state = EditorState.create({
    doc,
    plugins: [createContents({ template: () => BASE_TEMPLATE })],
    selection: NodeSelection.create(doc, list),
  });
  const view = new EditorView(document.createElement('div'), { state });
  return { view, list };
}

const entriesOf = (view: EditorView, list: number) => {
  const node = view.state.doc.nodeAt(list);
  return contentsEntries(view, node ? { node, pos: list } : null, DEFAULT_EDITOR_LABELS);
};

// A menu item's label, whether it is checked, and its action.
interface Item {
  readonly label?: string;
  readonly isSelected?: boolean;
  readonly onAction?: () => void;
}

const items = (entries: MenuEntry[]): readonly Item[] => {
  const [groups] = entries;
  return groups && 'items' in groups ? (groups.items as readonly Item[]) : [];
};

describe('a list of references in the context menu', () => {
  it('DOCE-EDITOR-3.8 offers a check item for each group the list may show', () => {
    const { view, list } = referencesView();
    const entries = entriesOf(view, list);
    expect(entries[0]).toMatchObject({ id: 'contents-groups', label: 'Reference types' });
    expect(items(entries).map((item) => [item.label, item.isSelected])).toEqual([
      ['Documents', true],
      ['catalogue-entry', true],
    ]);
    const documents = items(entries)[0];
    documents?.onAction?.();
    expect(view.state.doc.nodeAt(list)?.attrs.refFilter).toBe('catalogue-entry');
    const shown = items(entriesOf(view, list)).map((item) => item.isSelected);
    expect(shown).toEqual([false, true]);
    view.destroy();
  });
});

describe('a table of contents in the context menu', () => {
  it('DOCE-EDITOR-3.8 names its depth with the labels a host gives', () => {
    const doc = readDocumentFile(
      { formatVersion: 1, sections: [{ name: null, content: [{ type: 'contents' }] }] },
      documentSchema,
    ).doc;
    let list = 0;
    doc.descendants((node, pos) => {
      if (node.type.name === 'toc_block') list = pos;
    });
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc, selection: NodeSelection.create(doc, list) }),
    });
    const node = view.state.doc.nodeAt(list);
    const entries = contentsEntries(view, node ? { node, pos: list } : null, {
      ...DEFAULT_EDITOR_LABELS,
      contentsDepth: 'Lowest heading level',
      depthLevel: (depth) => `Level ${String(depth)}`,
    });
    expect(entries[0]).toMatchObject({ label: 'Lowest heading level' });
    expect(items(entries).map((item) => item.label)).toEqual([
      'Level 1',
      'Level 2',
      'Level 3',
      'Level 4',
      'Level 5',
      'Level 6',
    ]);
    view.destroy();
  });
});
