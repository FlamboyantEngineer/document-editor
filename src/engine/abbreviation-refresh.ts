// Abbreviations brought up to date with the glossary as the writer adds them: an abbreviation the
// writer's own change puts in, as a paste or an undo may, is looked up, and when its entry reads
// otherwise now it is written again, as one change kept out of the history and of suggestion
// tracking (`ABBREVIATION_CACHE_REFRESH_META`). An abbreviation that changed while the glossary was
// asked is left as it is.

import { Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { ReplaceAroundStep, ReplaceStep } from 'prosemirror-transform';
import type { EditorView } from 'prosemirror-view';
import type { GlossaryAdapter } from '../host/index.js';
import { ABBREVIATION_CACHE_REFRESH_META } from '../model/index.js';
import { abbreviationReadings, refreshAbbreviations } from './abbreviations.js';
import { isLocalEdit } from './transaction-kind.js';

/** How abbreviations the writer adds are refreshed. */
export interface AbbreviationRefreshOptions {
  /** The glossary as the editor has it now; none refreshes nothing. */
  readonly glossary: () => Pick<GlossaryAdapter, 'resolve'> | undefined;
  /** Whether the writer edits directly now, the only writer whose additions are refreshed. */
  readonly enabled?: (() => boolean) | undefined;
}

const refreshKey = new PluginKey('abbreviation-refresh');

// The entries the abbreviations a change puts in cite.
function insertedEntries(tr: Transaction, into: Set<string>) {
  for (const step of tr.steps) {
    if (!(step instanceof ReplaceStep || step instanceof ReplaceAroundStep)) continue;
    step.slice.content.descendants((node) => {
      if (node.type.name !== 'abbreviation_reference') return true;
      if (node.attrs.entryId) into.add(String(node.attrs.entryId));
      return false;
    });
  }
}

// Looks the entries up and writes again the abbreviations that still read as they did.
async function refresh(
  view: EditorView,
  glossary: Pick<GlossaryAdapter, 'resolve'>,
  ids: string[],
) {
  const asRead = abbreviationReadings(view.state.doc).filter((each) => ids.includes(each.id));
  const result = await glossary.resolve(ids).catch(() => null);
  if (view.isDestroyed || !result?.ok || !view.editable) return;
  refreshAbbreviations(result.value, asRead)(view.state, (tr) =>
    view.dispatch(tr.setMeta(ABBREVIATION_CACHE_REFRESH_META, true).setMeta('addToHistory', false)),
  );
}

/**
 * Refreshes the abbreviations the writer's own changes add from the glossary
 * (DOCE-REFERENCES-2.5): not those of remote, derived or system changes, nor its own refreshes.
 */
export function createAbbreviationRefresh({
  glossary,
  enabled = () => true,
}: AbbreviationRefreshOptions): Plugin {
  const added = new Set<string>();
  return new Plugin({
    key: refreshKey,
    appendTransaction(transactions) {
      for (const tr of transactions) {
        if (isLocalEdit(tr) && !tr.getMeta(ABBREVIATION_CACHE_REFRESH_META)) {
          insertedEntries(tr, added);
        }
      }
      return null;
    },
    view: (view) => ({
      update() {
        if (added.size === 0) return;
        const ids = [...added];
        added.clear();
        const source = glossary();
        if (source && enabled() && view.editable) void refresh(view, source, ids);
      },
    }),
  });
}
