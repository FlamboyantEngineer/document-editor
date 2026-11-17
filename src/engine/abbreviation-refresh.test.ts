import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import type { HostResult } from '../host/index.js';
import {
  ABBREVIATION_CACHE_REFRESH_META,
  type GlossaryEntry,
  readDocumentFile,
} from '../model/index.js';
import { createAbbreviationRefresh } from './abbreviation-refresh.js';
import { abbreviationReadings, refreshAbbreviations } from './abbreviations.js';
import { markSystemChange } from './transaction-kind.js';

const STALE = { id: 'g1', abbreviation: 'GSE', expansion: 'Ground equipment' };
const NOW: GlossaryEntry = {
  id: 'g1',
  abbreviation: 'GSE',
  expansion: 'Ground support equipment',
  archivedAt: null,
  createdBy: 'writer',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
};

const abbreviation = (entry: typeof STALE) => ({
  type: 'abbreviation_reference',
  attrs: {
    entryId: entry.id,
    display: 'full',
    abbr: entry.abbreviation,
    expansion: entry.expansion,
  },
});

// A glossary whose answers the test hands out when it likes.
function glossaryOf() {
  const asked: { ids: readonly string[]; answer: (value: GlossaryEntry[]) => void }[] = [];
  const resolve = vi.fn(
    (ids: readonly string[]) =>
      new Promise<HostResult<GlossaryEntry[]>>((done) => {
        asked.push({ ids, answer: (value) => done({ ok: true, value }) });
      }),
  );
  return { resolve, asked };
}

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
});

function viewOf(glossary: ReturnType<typeof glossaryOf>, enabled = () => true) {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          name: null,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Use here.' }] }],
        },
      ],
    },
    documentSchema,
  ).doc;
  const state = EditorState.create({
    doc,
    plugins: [createAbbreviationRefresh({ glossary: () => glossary, enabled })],
  });
  const view = new EditorView(document.createElement('div'), { state });
  views.push(view);
  return view;
}

// Puts a stale abbreviation in after "Use", as a paste would.
function paste(view: EditorView) {
  let at = -1;
  view.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text?.startsWith('Use')) at = pos + 4;
    return at < 0;
  });
  const node = documentSchema.nodeFromJSON(abbreviation(STALE));
  return view.state.tr
    .setSelection(TextSelection.create(view.state.doc, at))
    .replaceSelectionWith(node);
}

const expansions = (view: EditorView) =>
  abbreviationReadings(view.state.doc).map((each) => each.expansion);
const settle = () => new Promise((done) => setTimeout(done, 0));

describe('abbreviations a writer adds', () => {
  it('DOCE-REFERENCES-2.5 refreshes a pasted abbreviation from the glossary, out of the history', async () => {
    const glossary = glossaryOf();
    const view = viewOf(glossary);
    view.dispatch(paste(view).setMeta('uiEvent', 'paste'));
    expect(glossary.asked.map((each) => each.ids)).toEqual([['g1']]);
    glossary.asked[0]?.answer([NOW]);
    await settle();
    expect(expansions(view)).toEqual(['Ground support equipment']);
    // A second stale copy is refreshed too, by a change marked as a refresh and out of the history.
    const dispatched: Transaction[] = [];
    view.setProps({
      dispatchTransaction: (tr) => {
        dispatched.push(tr);
        view.updateState(view.state.apply(tr));
      },
    });
    view.dispatch(paste(view));
    glossary.asked[1]?.answer([NOW]);
    await settle();
    expect(expansions(view)).toEqual(['Ground support equipment']);
    const refresh = dispatched.at(-1);
    expect(refresh?.getMeta(ABBREVIATION_CACHE_REFRESH_META)).toBe(true);
    expect(refresh?.getMeta('addToHistory')).toBe(false);
  });

  it('DOCE-REFERENCES-2.5 leaves an abbreviation that changed while the glossary was asked', async () => {
    const glossary = glossaryOf();
    const view = viewOf(glossary);
    view.dispatch(paste(view));
    let pos = -1;
    view.state.doc.descendants((node, at) => {
      if (node.type.name === 'abbreviation_reference') pos = at;
    });
    const changed = view.state.doc.nodeAt(pos);
    view.dispatch(
      view.state.tr.setNodeMarkup(pos, undefined, {
        ...changed?.attrs,
        expansion: 'Edited meanwhile',
      }),
    );
    glossary.asked[0]?.answer([NOW]);
    await settle();
    expect(expansions(view)).toEqual(['Edited meanwhile']);
  });

  it('DOCE-REFERENCES-2.5 asks nothing for system changes, refreshes, or a writer who suggests', () => {
    const glossary = glossaryOf();
    let direct = true;
    const view = viewOf(glossary, () => direct);
    view.dispatch(markSystemChange(paste(view)));
    expect(glossary.resolve).not.toHaveBeenCalled();
    direct = false;
    view.dispatch(paste(view));
    expect(glossary.resolve).not.toHaveBeenCalled();
  });

  it('DOCE-REFERENCES-2.2 refreshes only the abbreviations that read as they did when looked up', () => {
    const glossary = glossaryOf();
    const view = viewOf(glossary);
    view.dispatch(paste(view));
    const other = { ...STALE, expansion: 'Read otherwise' };
    let next = view.state;
    refreshAbbreviations([NOW], [other])(view.state, (tr) => (next = view.state.apply(tr)));
    expect(refreshAbbreviations([NOW], [other])(view.state)).toBe(false);
    expect(refreshAbbreviations([NOW], [STALE])(next)).toBe(true);
  });
});
