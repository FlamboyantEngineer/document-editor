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
import { readContent, writeContent } from '../collab/delta.js';
import { diffNodes } from '../collab/diff.js';
import { createRoomScope, resolveRoomScope, type RoomScope } from '../collab/room-scope.js';
import { createCollabSync, getCollabSync } from '../collab/sync.js';
import { createCollabUndo } from '../collab/undo.js';
import { createPresence } from '../engine/presence.js';
import { markRemote } from '../engine/transaction-kind.js';
import type { TemplatePin } from '../model/format/template-format.js';

const TEMPLATE_ATTR = 'template';

/** A room's shared document, as a session uses it. */
export interface RoomBinding {
  /** The shared document this binding's plugins read and write. */
  readonly shared: unknown;
  /** The document the room holds, or null while it holds none; throws on one it cannot read. */
  content(): ProseMirrorNode | null;
  /**
   * The plugins that keep the editor and the room the same, with the writer's own undo, and the
   * other people in the room with their carets and selections.
   */
  readonly plugins: readonly Plugin[];
  /** The template the room's document pins, or null for the base template. */
  pin(): TemplatePin | null;
  /**
   * Pins a template for every reader; given `move`, also writes the room's content as `move` gives
   * it from what the room holds, in the same change, so no reader sees one without the other.
   */
  setPin(
    pin: TemplatePin | null,
    move?: ((held: ProseMirrorNode) => ProseMirrorNode | null) | undefined,
  ): void;
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
interface RoomBindingOptions {
  scope?: RoomScope | undefined;
  fieldKey?: string | undefined;
  schema: Schema;
  isRemoteOrigin: (origin: unknown) => boolean;
  /** The room's awareness, a `@y/protocols` awareness, when the connection has one. */
  awareness: unknown;
  /** The reader as the others see them, and the page's lifecycle (DOCE-SESSION-3.9). */
  presence: Omit<AwarenessPresenceOptions, 'awareness'>;
  /** Told once when the room comes to hold what the schema cannot read (DOCE-COLLAB-4.7). */
  onUnreadable: (error: unknown) => void;
}

// Presence through the room's awareness, when the connection has one.
function presencePlugins({ awareness, presence }: RoomBindingOptions) {
  if (!awareness) return [];
  const shared = awareness as PresenceAwareness;
  return [createPresence(), createAwarenessPresence({ ...presence, awareness: shared })];
}

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
  const scope = resolveRoomScope(doc, options.scope ?? createRoomScope(doc, options.fieldKey));
  const meta = scope.meta;
  const origin = { session: 'template' };
  const content = () => readContent(schema, scope.content);
  // Once the editor stopped on content the schema cannot read, the session neither reads the
  // room's content nor writes over it.
  let unreadable = false;
  const onUnreadable = (error: unknown) => {
    unreadable = true;
    options.onUnreadable(error);
  };
  // An unbound state's room content: null for an empty room, undefined when the session cannot
  // read or write on the state's behalf.
  const heldFor = (state: EditorState) => {
    const sync = getCollabSync(state);
    if (!sync || sync.bound || sync.type !== scope.content || unreadable) return undefined;
    try {
      return content();
    } catch {
      return undefined;
    }
  };
  return {
    shared,
    content,
    held: (state) => {
      const held = heldFor(state);
      return held && !held.eq(state.doc) ? withContent(state, held) : state;
    },
    write: (state) => {
      const held = heldFor(state);
      if (held === undefined || held?.eq(state.doc)) return;
      doc.transact(() => {
        if (held) scope.content.applyDelta(diffNodes(held, state.doc) as never);
        else writeContent(scope.content, state.doc);
      });
    },
    plugins: [
      ...presencePlugins({
        ...options,
        presence: { ...options.presence, field: scope.presence || undefined },
      }),
      createCollabSync({ doc, scope, isRemoteOrigin, onUnreadable }),
      createCollabUndo(),
    ],
    pin: () => asPin(meta.getAttr(TEMPLATE_ATTR)),
    setPin: (pin, move) => {
      const held = move && !unreadable ? content() : null;
      const moved = held && move ? move(held) : null;
      doc.transact(() => {
        meta.setAttr(TEMPLATE_ATTR, pin as never);
        if (held && moved && !moved.eq(held)) {
          scope.content.applyDelta(diffNodes(held, moved) as never);
        }
      }, origin);
    },
    followPin: (onPin) => {
      let following = true;
      const observer = (_event: unknown, tr: Y.Transaction) => {
        if (tr.origin !== origin) onPin(asPin(meta.getAttr(TEMPLATE_ATTR)));
      };
      meta.observe(observer);
      return () => {
        if (!following) return;
        following = false;
        meta.unobserve(observer);
      };
    },
  };
}
