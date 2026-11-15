import type * as Y from '@y/y';

/** Independent document fields sharing one room and transport. */
export interface RoomScope {
  readonly key?: string | undefined;
  readonly content: Y.Type;
  readonly meta: Y.Type;
  readonly comments: Y.Type;
  /** Awareness field reserved for this document's presence. */
  readonly presence: string;
}

/** Resolves a document's shared handles; omitting a key keeps the whole-document format. */
export function createRoomScope(doc: Y.Doc, key?: string): RoomScope {
  if (key === '') throw new Error('A field key must not be empty.');
  const name = (kind: string) =>
    key === undefined ? kind : `field:${JSON.stringify(key)}:${kind}`;
  return {
    key,
    content: doc.get(name('content')),
    meta: doc.get(name('meta')),
    comments: doc.get(name('comments')),
    presence: key === undefined ? '' : name('presence'),
  };
}

function nameOf(type: Y.Type): string {
  if (!type.doc) throw new Error('A field handle must be attached to a shared document.');
  for (const [name, shared] of type.doc.share) if (shared === type) return name;
  throw new Error('Field handles must be top-level shared types.');
}

/** Resolves the same field in a cloned or restored room. */
export function resolveRoomScope(doc: Y.Doc, scope?: RoomScope): RoomScope {
  if (!scope) return createRoomScope(doc);
  const types = [scope.content, scope.meta, scope.comments];
  if (types.some((type) => type.doc !== scope.content.doc))
    throw new Error('All field handles must belong to the same shared document.');
  if (new Set(types).size !== 3) throw new Error('Field namespaces must be distinct.');
  const [content, meta, comments] = types.map(nameOf);
  if (content === undefined || meta === undefined || comments === undefined)
    throw new Error('A field must provide all shared handles.');
  if (scope.content.doc === doc) return scope;
  return {
    key: scope.key,
    content: doc.get(content),
    meta: doc.get(meta),
    comments: doc.get(comments),
    presence: scope.presence,
  };
}
