// The abbreviations a document cites brought up to date with the glossary when it opens, for a
// host that asks: an abbreviation or expansion the glossary has changed since is written again,
// as one change marked as a cache refresh (`ABBREVIATION_CACHE_REFRESH_META`) that undo leaves.

import type { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useEffect, useRef, useState } from 'react';
import { documentAbbreviations, refreshAbbreviations } from '../../engine/index.js';
import type { GlossaryAdapter } from '../../host/index.js';
import { ABBREVIATION_CACHE_REFRESH_META } from '../../model/index.js';

/** What the opening refresh reads: the state's plugins, the glossary and whether it may write. */
interface OpeningAbbreviationsOptions {
  readonly plugins: readonly Plugin[];
  readonly glossary?: GlossaryAdapter | undefined;
  readonly enabled: boolean;
}

// Brings the view's abbreviations up to date with the glossary now; false when the view went
// before the glossary answered, so the next view asks again.
async function refreshOnce(view: EditorView, glossary: GlossaryAdapter): Promise<boolean> {
  const ids = [...new Set(documentAbbreviations(view.state.doc).map((entry) => entry.id))];
  if (ids.length === 0) return true;
  const resolved = await glossary.resolve(ids).catch(() => null);
  if (view.isDestroyed) return false;
  if (!resolved?.ok || !view.editable) return true;
  refreshAbbreviations(resolved.value)(view.state, (tr) =>
    view.dispatch(tr.setMeta(ABBREVIATION_CACHE_REFRESH_META, true).setMeta('addToHistory', false)),
  );
  return true;
}

/**
 * Refreshes the abbreviations of each document the editor is given once, however many views it
 * makes of it, while `enabled` (DOCE-REFERENCES-3.3).
 */
export function useOpeningAbbreviations(
  view: EditorView | null,
  { plugins, glossary, enabled }: OpeningAbbreviationsOptions,
): void {
  // The document is known by the first of its state's plugins, as the opening scripts know it.
  const [document] = plugins;
  const latest = useRef(glossary);
  useEffect(() => {
    latest.current = glossary;
  }, [glossary]);
  const opened = useRef<Plugin | undefined | null>(null);
  const [retries, setRetries] = useState(0);
  useEffect(() => {
    const source = latest.current;
    if (!view || !source || !enabled || opened.current === document) return;
    opened.current = document;
    void refreshOnce(view, source).then((done) => {
      if (done || opened.current !== document) return;
      opened.current = null;
      setRetries((count) => count + 1);
    });
  }, [view, document, enabled, retries]);
}
