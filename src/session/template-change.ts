import type { EditorState } from 'prosemirror-state';
import type { EditorHost } from '../host/adapters.js';
import type { TemplateFile, TemplatePin } from '../model/format/template-format.js';
import { loadPinnedTemplate } from './open-document.js';
import type { SessionStores } from './store-session.js';

// How many template changes each session's stores were asked for: only the last one asked shows.
const templateAsks = new WeakMap<SessionStores, number>();

/** A live room's permission check and the synchronous write of a loaded template. */
export interface TemplateCommit {
  allowed(): boolean;
  apply(template: TemplateFile): EditorState | undefined;
}

/**
 * Shows another template the document pins; null when it cannot load, the document is gone, or
 * another change was asked for since, whichever load ends first.
 */
export async function changeTemplate(
  {
    host,
    signal,
    isCurrent,
    commit,
  }: {
    host: EditorHost;
    signal: AbortSignal;
    isCurrent?: () => boolean;
    commit?: TemplateCommit | undefined;
  },
  stores: SessionStores,
  pin: TemplatePin | null,
) {
  const { status, document } = stores;
  const ask = (templateAsks.get(stores) ?? 0) + 1;
  templateAsks.set(stores, ask);
  const loaded = await loadPinnedTemplate(host, pin, signal);
  const current = () =>
    !signal.aborted && templateAsks.get(stores) === ask && isCurrent?.() !== false;
  if (!current() || commit?.allowed() === false) return null;
  if (!loaded.ok) status.set({ ...status.get(), error: loaded.error });
  if (!loaded.ok || !document.get()) return null;
  const state = commit?.apply(loaded.value.template);
  const shown = document.get();
  // Publishing to the shared room can synchronously change what the session shows.
  if (!shown || !current()) return null;
  const changed = {
    ...shown,
    state: state ?? shown.state,
    template: loaded.value.template,
    pin,
    templateUpdate: null,
  };
  document.set(changed);
  return { doc: changed.state.doc, saved: loaded.value.saved };
}
