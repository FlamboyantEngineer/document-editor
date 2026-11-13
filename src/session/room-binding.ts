// What a room-mode session reads and writes in its room's shared document: the content the editor
// binds to and the template pin in the `meta` type (docs/collaboration.md). The only session module
// that loads the realtime library, so the session loads it on demand (DOCE-SESSION-3.1).

import type * as Y from '@y/y';
import type { Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import type { EditorState, Plugin } from 'prosemirror-state';
import {
  type AwarenessPresenceOptions,
  createAwarenessPresence,
  type PresenceAwareness,
} from '../collab/awareness.js';
import { CONTENT_TYPE, readContent } from '../collab/delta.js';
import { diffNodes } from '../collab/diff.js';
import { createCollabSync, getCollabSync } from '../collab/sync.js';
import { createCollabUndo } from '../collab/undo.js';
import { createPresence } from '../engine/presence.js';
import { markRemote } from '../engine/transaction-kind.js';
import type { TemplatePin } from '../model/format/template-format.js';

const META_TYPE = 'meta';
const TEMPLATE_ATTR = 'template';

/** A room's shared document, as a session uses it. */
export interface RoomBinding {
  /** The document the room holds, or null while it holds none. */
  content(): ProseMirrorNode | null;
  /**
   * The plugins that keep the editor and the room the same, with the writer's own undo, and the
   * other people in the room with their carets and selections.
   */
  readonly plugins: readonly Plugin[];
  /** The template the room's document pins, or null for the base template. */
  pin(): TemplatePin | null;
  setPin(pin: TemplatePin | null): void;
  /** Calls `onPin` whenever another writer pins another template, until the returned function. */
  followPin(onPin: (pin: TemplatePin | null) => void): () => void;
  /**
   * The state on the content the room holds now, while no editor is bound to keep the two the
   * same: the state itself when an editor is bound or it holds that content already.
   */
  held(state: EditorState): EditorState;
  /**
   * Writes the document of a state made from one `held` gave to the room, as one local change the
   * connection sends and the editor takes once it binds. A bound editor sends its changes itself.
   */
  write(state: EditorState): void;
}

const asPin = (value: unknown): TemplatePin | null =>
  value && typeof value === 'object' && typeof (value as TemplatePin).id === 'string'
    ? (value as TemplatePin)
    : null;

/** How a session binds to its room. */
export interface RoomBindingOptions {
  schema: Schema;
  isRemoteOrigin: (origin: unknown) => boolean;
  /** The room's awareness, a `@y/protocols` awareness, when the connection has one. */
  awareness: unknown;
  /** The reader as the others see them, and the page's lifecycle (DOCE-SESSION-3.9). */
  presence: Omit<AwarenessPresenceOptions, 'awareness'>;
}

// Presence through the room's awareness, when the connection has one.
function presencePlugins({ awareness, presence }: RoomBindingOptions) {
  if (!awareness) return [];
  const shared = awareness as PresenceAwareness;
  return [createPresence(), createAwarenessPresence({ ...presence, awareness: shared })];
}

// Whether the state runs the room's sync plugin with no editor bound, so nothing keeps it and the
// room the same.
const unbound = (state: EditorState) => getCollabSync(state)?.bound === false;

// The state with the room's content in place of its own, as the editor takes it when it binds.
function withContent(state: EditorState, content: ProseMirrorNode): EditorState {
  const tr = state.tr.replaceWith(0, state.doc.content.size, content.content);
  for (const [key, value] of Object.entries(content.attrs)) tr.setDocAttribute(key, value);
  return state.apply(markRemote(tr).setMeta('addToHistory', false));
}

/** Binds a session to a room's shared document, a Y.Doc of `@y/y`. */
export function bindRoom(shared: unknown, options: RoomBindingOptions): RoomBinding {
  const { schema, isRemoteOrigin } = options;
  const doc = shared as Y.Doc;
  const meta = doc.get(META_TYPE);
  const origin = { session: 'template' };
  const content = () => readContent(schema, doc.get(CONTENT_TYPE));
  return {
    content,
    held: (state) => {
      const held = unbound(state) ? content() : null;
      return held && !held.eq(state.doc) ? withContent(state, held) : state;
    },
    write: (state) => {
      const held = unbound(state) ? content() : null;
      if (!held || held.eq(state.doc)) return;
      const change = diffNodes(held, state.doc);
      doc.transact(() => {
        doc.get(CONTENT_TYPE).applyDelta(change as never);
      });
    },
    plugins: [
      ...presencePlugins(options),
      createCollabSync({ doc, isRemoteOrigin }),
      createCollabUndo(),
    ],
    pin: () => asPin(meta.getAttr(TEMPLATE_ATTR)),
    setPin: (pin) => {
      doc.transact(() => {
        meta.setAttr(TEMPLATE_ATTR, pin as never);
      }, origin);
    },
    followPin: (onPin) => {
      const observer = (_event: unknown, tr: Y.Transaction) => {
        if (tr.origin !== origin) onPin(asPin(meta.getAttr(TEMPLATE_ATTR)));
      };
      meta.observe(observer);
      return () => meta.unobserve(observer);
    },
  };
}
