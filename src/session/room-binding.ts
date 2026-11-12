// What a room-mode session reads and writes in its room's shared document: the content the editor
// binds to and the template pin in the `meta` type (docs/collaboration.md). The only session module
// that loads the realtime library, so the session loads it on demand (DOCE-SESSION-3.1).

import type * as Y from '@y/y';
import type { Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import type { Plugin } from 'prosemirror-state';
import { CONTENT_TYPE, readContent } from '../collab/delta.js';
import { createCollabSync } from '../collab/sync.js';
import type { TemplatePin } from '../model/format/template-format.js';

const META_TYPE = 'meta';
const TEMPLATE_ATTR = 'template';

/** A room's shared document, as a session uses it. */
export interface RoomBinding {
  /** The document the room holds, or null while it holds none. */
  content(): ProseMirrorNode | null;
  /** The plugin that keeps the editor and the room the same. */
  readonly plugin: Plugin;
  /** The template the room's document pins, or null for the base template. */
  pin(): TemplatePin | null;
  setPin(pin: TemplatePin | null): void;
  /** Calls `onPin` whenever another writer pins another template, until the returned function. */
  followPin(onPin: (pin: TemplatePin | null) => void): () => void;
}

const asPin = (value: unknown): TemplatePin | null =>
  value && typeof value === 'object' && typeof (value as TemplatePin).id === 'string'
    ? (value as TemplatePin)
    : null;

/** Binds a session to a room's shared document, a Y.Doc of `@y/y`. */
export function bindRoom(
  shared: unknown,
  schema: Schema,
  isRemoteOrigin: (origin: unknown) => boolean,
): RoomBinding {
  const doc = shared as Y.Doc;
  const meta = doc.get(META_TYPE);
  const origin = { session: 'template' };
  return {
    content: () => readContent(schema, doc.get(CONTENT_TYPE)),
    plugin: createCollabSync({ doc, isRemoteOrigin }),
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
