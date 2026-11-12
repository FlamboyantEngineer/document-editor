import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseMarkup } from '../../../test/document-markup.js';
import { documentAbbreviations } from '../../engine/index.js';
import type { GlossaryAdapter, ScriptRunnerAdapter } from '../../host/index.js';
import { createEditorContext, type EditorContextOptions } from './editor-context.js';
import { DEFAULT_EDITOR_LABELS } from './editor-labels.js';
import { toolsEntries } from './tools-entries.js';

let view: EditorView | null = null;
afterEach(() => view?.destroy());

const ABBREVIATION =
  '<p>The <span data-abbreviation-ref="g1" data-abbr="OP" data-expansion="Old phrase"></span></p>';

function viewOf(html: string) {
  view = new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc: parseMarkup(html) }),
  });
  return view;
}

const contextOf = (shown: EditorView, options: Partial<EditorContextOptions> = {}) =>
  createEditorContext(shown, shown.state, {
    editable: true,
    labels: DEFAULT_EDITOR_LABELS,
    ...options,
  });

type Entry = { id: unknown; isDisabled?: boolean; description?: unknown; onAction?: () => void };
const entry = (entries: readonly unknown[], id: string) => {
  const found = (entries as Entry[]).find((each) => each.id === id);
  if (!found) throw new Error(`No ${id} entry.`);
  return found;
};

const glossary = (): GlossaryAdapter => ({
  search: vi.fn(),
  create: vi.fn(),
  resolve: vi.fn(() =>
    Promise.resolve({
      ok: true as const,
      value: [
        {
          id: 'g1',
          abbreviation: 'NP',
          expansion: 'New phrase',
          archivedAt: null,
          createdBy: 'lab',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
    }),
  ),
});

describe('the Tools menu', () => {
  it('DOCE-EDITOR-4.17 updates every abbreviation from the glossary', async () => {
    const shown = viewOf(ABBREVIATION);
    const adapter = glossary();
    const entries = toolsEntries(contextOf(shown), { view: shown, glossary: adapter });
    entry(entries, 'update-abbreviations').onAction?.();
    await vi.waitFor(() =>
      expect(documentAbbreviations(shown.state.doc)[0]?.abbreviation).toBe('NP'),
    );
    expect(adapter.resolve).toHaveBeenCalledWith(['g1']);
  });

  it('DOCE-EDITOR-4.17 offers updates only while the writer can edit, saying why', () => {
    const shown = viewOf(ABBREVIATION);
    const scriptRunner = { run: vi.fn() } as unknown as ScriptRunnerAdapter;
    const features = {
      view: shown,
      glossary: glossary(),
      scriptRunner,
      template: { formatVersion: 1 as const, id: 'sample' },
    };
    const editing = toolsEntries(contextOf(shown), features);
    expect(entry(editing, 'update-references').isDisabled).toBe(false);
    expect(entry(editing, 'run-all-scripts').isDisabled).toBe(false);
    const reading = toolsEntries(contextOf(shown, { editable: false }), features);
    expect(entry(reading, 'update-references')).toMatchObject({
      isDisabled: true,
      description: 'The document is open for reading',
    });
    // Running scripts replaces content no suggestion tracks.
    const suggesting = toolsEntries(contextOf(shown, { suggesting: true }), features);
    expect(entry(suggesting, 'update-references').isDisabled).toBe(false);
    expect(entry(suggesting, 'run-all-scripts')).toMatchObject({
      isDisabled: true,
      description: 'Not available while suggesting',
    });
  });
});
