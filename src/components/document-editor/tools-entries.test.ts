import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { createDocumentEditing } from '../../engine/index.js';
import { createMemoryHost, type GlossaryAdapter } from '../../host/index.js';
import { readDocumentFile } from '../../model/index.js';
import { createEditorContext } from './editor-context.js';
import { DEFAULT_EDITOR_LABELS } from './editor-labels.js';
import { toolsEntries } from './tools-entries.js';

let view: EditorView | null = null;

// A glossary that answers a resolve as asked.
function glossaryWith(resolve: GlossaryAdapter['resolve']): GlossaryAdapter {
  const { glossary } = createMemoryHost();
  if (!glossary) throw new Error('The memory host keeps a glossary.');
  return { ...glossary, resolve };
}

afterEach(() => {
  if (!view?.isDestroyed) view?.destroy();
  view = null;
});

// A view of a paragraph citing one abbreviation, and the Tools entry that updates them.
function updateEntry(glossary: GlossaryAdapter) {
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
                {
                  type: 'abbreviation',
                  attrs: { entry: 'g1', abbreviation: 'GSE', expansion: 'Ground support' },
                },
              ],
            },
          ],
        },
      ],
    },
    documentSchema,
  );
  const shown = new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) }),
  });
  view = shown;
  const context = createEditorContext(shown, shown.state, {
    editable: true,
    labels: DEFAULT_EDITOR_LABELS,
  });
  const entry = toolsEntries(context, { view: shown, glossary }).find(
    (each) => each.id === 'update-abbreviations',
  );
  if (!entry || !('onAction' in entry)) throw new Error('No update entry.');
  return { shown, entry };
}

describe('Tools entries', () => {
  it('DOCE-EDITOR-4.17 changes nothing when the glossary fails or the view is gone meanwhile', async () => {
    const resolve = vi.fn<GlossaryAdapter['resolve']>(() => Promise.reject(new Error('offline')));
    const { shown, entry } = updateEntry(glossaryWith(resolve));
    const before = shown.state.doc;
    entry.onAction?.();
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(shown.state.doc).toBe(before);

    let answer: () => void = () => undefined;
    const entry1 = {
      id: 'g1',
      abbreviation: 'GSE',
      expansion: 'Ground support equipment',
      archivedAt: null,
      createdBy: 'ada',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    const slow = glossaryWith(
      () =>
        new Promise((done) => {
          answer = () => done({ ok: true, value: [entry1] });
        }),
    );
    const late = updateEntry(slow);
    const dispatch = vi.spyOn(late.shown, 'dispatch');
    late.entry.onAction?.();
    late.shown.destroy();
    answer();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('DOCE-PAGINATION-8.4 stores every variable text again from the Tools menu, as one edit', () => {
    const { doc } = readDocumentFile(
      {
        formatVersion: 1,
        values: { 'document.name': 'Old name' },
        sections: [
          {
            name: null,
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'variable', attrs: { key: 'document.name' } }],
              },
            ],
          },
        ],
      },
      documentSchema,
    );
    const shown = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc, plugins: createDocumentEditing(documentSchema) }),
    });
    view = shown;
    const context = createEditorContext(shown, shown.state, {
      editable: true,
      labels: DEFAULT_EDITOR_LABELS,
    });
    const variables = { value: (key: string) => (key === 'document.name' ? 'New name' : null) };
    const entry = toolsEntries(context, { view: shown, variables }).find(
      (each) => each.id === 'update-variables',
    );
    if (!entry || !('onAction' in entry)) throw new Error('No variables entry.');
    expect(entry.label).toBe('Update variables and dates');
    entry.onAction?.();
    expect(shown.state.doc.attrs.values).toEqual({ 'document.name': 'New name' });
  });
});
