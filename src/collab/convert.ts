// A shared room's document and the stored document it holds, converted without the editor or a
// DOM, for room seeds and server reads (DOCE-COLLAB-6.2). The room's layout is in
// docs/collaboration.md: the canonical state in `content`, the stored format version and template
// pin in `meta`, the threads in `comments`.

import * as Y from '@y/y';
import type { Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { assignElementIds } from '../engine/element-ids.js';
import {
  DOCUMENT_FORMAT_VERSION,
  type DocumentFile,
  type DocumentReadOptions,
} from '../model/format/document-format.js';
import { readDocumentFile } from '../model/format/document-format-convert.js';
import {
  type DocumentWriteOptions,
  writeDocumentFile,
} from '../model/format/document-format-write.js';
import type { TemplatePin } from '../model/format/template-format.js';
import { CONTENT_TYPE, readContent, writeContent } from './delta.js';
import { diffNodes } from './diff.js';

/** The room's type for the comment and suggestion threads, one attribute per thread id. */
export const COMMENTS_TYPE = 'comments';

/** The room's type for the document's settings outside its content. */
export const META_TYPE = 'meta';

const FORMAT_VERSION_KEY = 'formatVersion';
const TEMPLATE_KEY = 'template';

/** How a stored document goes into a room. */
export interface RoomWriteOptions {
  schema: Schema;
  /** What the read does with stored content the schema cannot hold; `throw` by default. */
  unknown?: DocumentReadOptions['unknown'];
  /** Makes the id of an element that has none; random by default, as the editor's. */
  newId?: (() => string) | undefined;
}

/** How a stored document's changes go into a room that holds one. */
export interface RoomUpdateOptions extends RoomWriteOptions {
  /** The Yjs transaction's origin, such as the host's own server origin; `null` by default. */
  origin?: unknown;
}

/** How a room's document is read back as a stored one. */
export interface RoomReadOptions {
  schema: Schema;
  /** How split blocks are joined; a host adds rules for its own splittable types. */
  fragmentRules?: DocumentWriteOptions['fragmentRules'];
}

// The document with the ids the editor would give its elements on the first change: a room seeded
// without them would have every writer send them, each with ids of their own.
function withElementIds(node: ProseMirrorNode, newId: RoomWriteOptions['newId']): ProseMirrorNode {
  const tr = EditorState.create({ doc: node }).tr;
  return assignElementIds(tr, { newId }) ? tr.doc : node;
}

// Refuses a room of another format version than the library reads and writes.
function checkFormatVersion(version: unknown): void {
  if (version !== undefined && version !== DOCUMENT_FORMAT_VERSION) {
    throw new Error(
      `The room holds format version ${String(version)}, not ${String(DOCUMENT_FORMAT_VERSION)}.`,
    );
  }
}

/**
 * Writes a stored document into a Yjs document that holds none yet, in one transaction: its
 * content into `content` and its format version and template pin into `meta`. An element without
 * its own valid id gets one here, as the editor would give it.
 */
export function writeRoomDocument(doc: Y.Doc, file: DocumentFile, options: RoomWriteOptions): void {
  const content = doc.get(CONTENT_TYPE);
  if (content.length > 0) throw new Error('The room already holds a document.');
  const read = readDocumentFile(file, options.schema, { unknown: options.unknown });
  const node = withElementIds(read.doc, options.newId);
  doc.transact(() => {
    writeContent(content, node);
    const meta = doc.get(META_TYPE);
    meta.setAttr(FORMAT_VERSION_KEY, DOCUMENT_FORMAT_VERSION);
    meta.setAttr(TEMPLATE_KEY, file.template ?? null);
  });
}

/**
 * Writes a stored document into a Yjs document that may hold one already, as one transaction under
 * `origin`: only what differs from the content it holds, so writers in the room keep their place
 * and their own changes, and its format version and template pin into `meta` where they differ. A
 * room that holds no document takes the whole of it, as `writeRoomDocument` writes it. Throws, and
 * changes nothing, when the room holds what the schema cannot read.
 */
export function updateRoomDocument(
  doc: Y.Doc,
  file: DocumentFile,
  options: RoomUpdateOptions,
): void {
  const content = doc.get(CONTENT_TYPE);
  const held = readContent(options.schema, content);
  const read = readDocumentFile(file, options.schema, { unknown: options.unknown });
  const node = withElementIds(read.doc, options.newId);
  const meta = doc.get(META_TYPE);
  checkFormatVersion(meta.getAttr(FORMAT_VERSION_KEY));
  const template = file.template ?? null;
  doc.transact(() => {
    if (!held) writeContent(content, node);
    else if (!held.eq(node)) content.applyDelta(diffNodes(held, node) as never);
    if (meta.getAttr(FORMAT_VERSION_KEY) !== DOCUMENT_FORMAT_VERSION)
      meta.setAttr(FORMAT_VERSION_KEY, DOCUMENT_FORMAT_VERSION);
    if (JSON.stringify(meta.getAttr(TEMPLATE_KEY) ?? null) !== JSON.stringify(template))
      meta.setAttr(TEMPLATE_KEY, template);
  }, options.origin ?? null);
}

/** The stored document a Yjs document holds, or `null` when its `content` is empty. */
export function readRoomDocument(doc: Y.Doc, options: RoomReadOptions): DocumentFile | null {
  const node = readContent(options.schema, doc.get(CONTENT_TYPE));
  if (!node) return null;
  const meta = doc.get(META_TYPE);
  checkFormatVersion(meta.getAttr(FORMAT_VERSION_KEY));
  node.check();
  const template = (meta.getAttr(TEMPLATE_KEY) ?? null) as TemplatePin | null;
  return writeDocumentFile(node, { template, fragmentRules: options.fragmentRules });
}

/**
 * `documentToYjs`: the Yjs update that builds a room holding a stored document, for a room
 * server's seed.
 */
export function documentToYjs(file: DocumentFile, options: RoomWriteOptions): Uint8Array {
  const doc = new Y.Doc();
  try {
    writeRoomDocument(doc, file, options);
    return Y.encodeStateAsUpdate(doc);
  } finally {
    doc.destroy();
  }
}

/**
 * `yjsToDocument`: the stored document a room's state holds, from a Yjs update such as a room
 * server stores, for readers outside the room; `null` for a room with no document.
 */
export function yjsToDocument(update: Uint8Array, options: RoomReadOptions): DocumentFile | null {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, update);
    return readRoomDocument(doc, options);
  } finally {
    doc.destroy();
  }
}
