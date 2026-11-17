import type { MenuEntry, MenuItemEntry } from '@flamboyantengineer/ui-components/menu';
import { EditorState, NodeSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { createAbbreviationHealth, recordGlossaryEntries } from '../../engine/index.js';
import { readDocumentFile, type StoredNode } from '../../model/index.js';
import { abbreviationEntries } from './abbreviation-entries.js';
import { DEFAULT_EDITOR_LABELS } from './editor-labels.js';

const abbreviation = (entry: string, short: string, expansion: string): StoredNode => ({
  type: 'abbreviation',
  attrs: { entry, abbreviation: short, expansion },
});

// A document citing two entries that read GSE, and an archived one, the first selected.
function viewOf() {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            {
              type: 'paragraph',
              content: [
                abbreviation('g1', 'GSE', 'Ground support equipment'),
                { type: 'text', text: ' and ' },
                abbreviation('g2', 'gse', 'General system element'),
              ],
            },
          ],
        },
      ],
    },
    documentSchema,
  ).doc;
  const glossary = { resolve: () => Promise.resolve({ ok: true as const, value: [] }) };
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({
      doc,
      plugins: [createAbbreviationHealth({ glossary, delay: 60_000 })],
    }),
  });
  const entries = [
    { id: 'g1', abbreviation: 'GSE', archivedAt: null },
    { id: 'g2', abbreviation: 'gse', archivedAt: null },
  ];
  recordGlossaryEntries(['g1', 'g2'], entries)(view.state, view.dispatch);
  let first = -1;
  view.state.doc.descendants((node, pos) => {
    if (first < 0 && node.type.name === 'abbreviation_reference') first = pos;
  });
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, first)));
  return view;
}

const item = (entries: readonly MenuEntry[], id: string) =>
  entries.find(
    (entry) => entry.type !== 'section' && entry.type !== 'separator' && entry.id === id,
  ) as MenuItemEntry | undefined;

describe('abbreviation entries', () => {
  it('DOCE-REFERENCES-2.3 offers to cite another entry for a duplicate, and does it', () => {
    const view = viewOf();
    const openDialog = vi.fn();
    const entries = abbreviationEntries(view, { labels: DEFAULT_EDITOR_LABELS, openDialog });
    expect(
      entries.map((entry) =>
        entry.type === undefined || entry.type === 'item' ? entry.label : '',
      ),
    ).toEqual([
      'Cite another entry…',
      'Use gse: General system element',
      'Show short',
      'Turn into text',
    ]);
    item(entries, 'relink-abbreviation')?.onAction?.();
    expect(openDialog).toHaveBeenCalledWith({ kind: 'abbreviation' });
    item(entries, 'use-abbreviation-g2')?.onAction?.();
    const selected = view.state.selection as NodeSelection;
    expect(selected.node.attrs).toMatchObject({
      entryId: 'g2',
      abbr: 'gse',
      expansion: 'General system element',
    });
    view.destroy();
  });

  it('DOCE-REFERENCES-3.2 offers to cite another entry for any abbreviation, each entry with its glyph', () => {
    const view = viewOf();
    // The second abbreviation, once its entry reads otherwise, has no issue.
    recordGlossaryEntries(['g2'], [{ id: 'g2', abbreviation: 'GSU', archivedAt: null }])(
      view.state,
      view.dispatch,
    );
    let second = -1;
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'abbreviation_reference') second = pos;
    });
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, second)));
    const entries = abbreviationEntries(view, {
      labels: DEFAULT_EDITOR_LABELS,
      openDialog: vi.fn(),
    }) as MenuItemEntry[];
    expect(entries.map((entry) => entry.id)).toEqual([
      'relink-abbreviation',
      'abbreviation-form',
      'unlink-abbreviation',
    ]);
    expect(entries.every((entry) => entry.icon)).toBe(true);
    view.destroy();
  });
});
