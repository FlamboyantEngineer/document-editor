import { renderHook, waitFor } from '@testing-library/react';
import { EditorState, type Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { createDocumentEditing } from '../../engine/index.js';
import { createMemoryHost, type GlossaryAdapter } from '../../host/index.js';
import { ABBREVIATION_CACHE_REFRESH_META, readDocumentFile } from '../../model/index.js';
import { useOpeningAbbreviations } from './opening-abbreviations.js';

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) if (!view.isDestroyed) view.destroy();
});

const ENTRY = {
  id: 'g1',
  abbreviation: 'GSE',
  expansion: 'Ground support equipment',
  archivedAt: null,
  createdBy: 'ada',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

// A glossary that has the entry as it reads now.
function glossary(): GlossaryAdapter & { resolve: ReturnType<typeof vi.fn> } {
  const { glossary: memory } = createMemoryHost();
  if (!memory) throw new Error('The memory host keeps a glossary.');
  return {
    ...memory,
    resolve: vi.fn(() => Promise.resolve({ ok: true as const, value: [ENTRY] })),
  };
}

// A view of a paragraph citing the entry by the expansion it read last, and the changes it takes.
function viewCiting(expansion: string) {
  const { doc } = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'abbreviation', attrs: { entry: 'g1', abbreviation: 'GSE', expansion } },
              ],
            },
          ],
        },
      ],
    },
    documentSchema,
  );
  const changes: Transaction[] = [];
  const view: EditorView = new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) }),
    dispatchTransaction: (tr) => {
      changes.push(tr);
      view.updateState(view.state.apply(tr));
    },
  });
  views.push(view);
  return { view, changes };
}

const expansionOf = (view: EditorView) => {
  let found: unknown = null;
  view.state.doc.descendants((node) => {
    if (node.type.name === 'abbreviation_reference') found = node.attrs.expansion;
  });
  return found;
};

describe('refreshing abbreviations on opening', () => {
  it('DOCE-REFERENCES-3.3 brings stale abbreviations up to date once, as a cache refresh', async () => {
    const { view, changes } = viewCiting('Ground support');
    const source = glossary();
    const { rerender } = renderHook(
      ({ plugins }) => useOpeningAbbreviations(view, { plugins, glossary: source, enabled: true }),
      { initialProps: { plugins: view.state.plugins } },
    );
    await waitFor(() => expect(expansionOf(view)).toBe('Ground support equipment'));
    expect(changes).toHaveLength(1);
    expect(changes[0]?.getMeta(ABBREVIATION_CACHE_REFRESH_META)).toBe(true);
    expect(changes[0]?.getMeta('addToHistory')).toBe(false);
    rerender({ plugins: view.state.plugins });
    await Promise.resolve();
    expect(source.resolve).toHaveBeenCalledTimes(1);
  });

  it('DOCE-REFERENCES-3.3 writes nothing for current abbreviations, or when it may not write', async () => {
    const current = viewCiting('Ground support equipment');
    const source = glossary();
    renderHook(() =>
      useOpeningAbbreviations(current.view, {
        plugins: current.view.state.plugins,
        glossary: source,
        enabled: true,
      }),
    );
    await waitFor(() => expect(source.resolve).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(current.changes).toEqual([]);

    const off = viewCiting('Ground support');
    const unused = glossary();
    renderHook(() =>
      useOpeningAbbreviations(off.view, {
        plugins: off.view.state.plugins,
        glossary: unused,
        enabled: false,
      }),
    );
    await Promise.resolve();
    expect(unused.resolve).not.toHaveBeenCalled();
    expect(off.changes).toEqual([]);
  });
});
