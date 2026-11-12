// The editor state kept in sync with a shared Yjs document (`@y/y` 14), with no fork of a binding
// and no room server: the host hands in the document its provider keeps. The binding runs as a
// plugin view, so it works on the canonical state of the paged layout, whose plugin views run on a
// view of that state, as on any editor view.

import type * as Y from '@y/y';
import { Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { CONTENT_TYPE } from './delta.js';
import { type Binding, bindView, type CollabChange, type LocalSteps } from './sync-binding.js';

/** How an editor joins a shared document. */
export interface CollabSyncOptions {
  /** The shared document, such as a room provider's; the document is its `content` type. */
  doc: Y.Doc;
  /**
   * Whether a Yjs transaction origin is another person's, such as the provider's own origin.
   * Changes with other origins, but for the editor's own and its undo manager's, are the host's
   * system changes. Every origin is remote by default.
   */
  isRemoteOrigin?: ((origin: unknown) => boolean) | undefined;
  /**
   * Runs the application of changes from the shared document, once for a burst of them. Runs it
   * at the end of the current task by default (`queueMicrotask`).
   */
  schedule?: ((run: () => void) => void) | undefined;
}

/** A sync plugin's shared document and the origins of the changes it makes there. */
export interface CollabSync {
  readonly doc: Y.Doc;
  /** The shared type that holds the document. */
  readonly type: Y.Type;
  /** The origin of the editor's own changes: the one its undo manager tracks. */
  readonly origin: object;
  /** The origin of changes the binding makes for the editor, such as derived writes. */
  readonly derivedOrigin: object;
  /** Applies the changes from the shared document that wait for the scheduler, at once. */
  flush(): void;
}

export type { CollabChange, CollabChangeKind } from './sync-binding.js';

const collabSyncKey = new PluginKey<LocalSteps>('collab-sync');

const syncs = new WeakMap<Plugin, CollabSync>();

const NOT_TRACKING: LocalSteps = { base: null, steps: [] };

/**
 * A plugin that keeps the editor's document and the shared document the same, both ways (decision
 * D30). Changes from the shared document reach the editor in one transaction per burst, marked
 * remote (`markRemote`) unless the host's `isRemoteOrigin` says otherwise, and out of the history.
 */
export function createCollabSync({
  doc,
  isRemoteOrigin = () => true,
  // Called as a function of its own: the platform's `queueMicrotask` throws when called on another
  // object, as the binding calls its source's scheduler.
  schedule = (run) => queueMicrotask(run),
}: CollabSyncOptions): Plugin<LocalSteps> {
  const type = doc.get(CONTENT_TYPE);
  const origin = { collabSync: 'local' };
  const derivedOrigin = { collabSync: 'derived' };
  let binding: Binding | null = null;
  const plugin: Plugin<LocalSteps> = new Plugin<LocalSteps>({
    key: collabSyncKey,
    state: {
      init: () => NOT_TRACKING,
      // The steps since the document the shared document last agreed with, so local changes the
      // binding has not sent yet can be moved after changes that reach the editor first.
      apply(tr, value) {
        if (!tr.docChanged || !binding) return value;
        if (binding.confirmed === tr.before) return { base: tr.before, steps: tr.steps };
        if (value.base === null) return value;
        return { base: value.base, steps: [...value.steps, ...tr.steps] };
      },
    },
    view(view) {
      const bound = bindView(view, {
        doc,
        type,
        origin,
        derivedOrigin,
        isRemoteOrigin,
        schedule,
        tag: (tr, change) => tr.setMeta(collabSyncKey, change),
        tracked: (state) => collabSyncKey.getState(state) ?? NOT_TRACKING,
      });
      binding = bound;
      return {
        update: () => bound.update(),
        destroy() {
          bound.destroy();
          if (binding === bound) binding = null;
        },
      };
    },
  });
  syncs.set(plugin, { doc, type, origin, derivedOrigin, flush: () => binding?.flush() });
  return plugin;
}

/** The sync plugin's shared document and origins, when the state runs one (`createCollabSync`). */
export function getCollabSync(state: { readonly plugins: readonly Plugin[] }): CollabSync | null {
  const plugin = state.plugins.find((each) => syncs.has(each));
  return plugin ? (syncs.get(plugin) ?? null) : null;
}

/** What a transaction the sync plugin applied from the shared document brings; `null` otherwise. */
export function readCollabChange(tr: Transaction): CollabChange | null {
  return (tr.getMeta(collabSyncKey) as CollabChange | undefined) ?? null;
}
