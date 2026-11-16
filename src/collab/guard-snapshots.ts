import type * as Y from '@y/y';
import type { Node, Schema } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import { type AnyDelta, readContent } from './delta.js';
import { captureGuardAnchors, type GuardAnchor } from './guard-anchors.js';
import { replayChange } from './replay.js';
import type { RoomScope } from './room-scope.js';

export interface GuardSnapshot {
  readonly scope: RoomScope;
  readonly content: Node | null;
  readonly comments: ReadonlyMap<string, unknown>;
  readonly meta: string;
  readonly anchors: readonly GuardAnchor[];
}

export function readGuardRecords(type: Y.Type): Map<string, unknown> {
  const result = new Map<string, unknown>();
  type.forEachAttr((value: unknown, key: string | number) => result.set(String(key), value));
  return result;
}

/** Keeps parsed content incrementally while the server owns and rolls back the shadow document. */
export function watchGuardSnapshots(
  doc: Y.Doc,
  options: { scopes: readonly RoomScope[]; schema: Schema },
) {
  const before = new WeakMap<Y.Transaction, readonly GuardSnapshot[]>();
  const content = new Map<RoomScope, Node | null>();
  const invalid = new Set<RoomScope>();
  const stops = options.scopes.map((scope) => {
    content.set(scope, readContent(options.schema, scope.content));
    const observer = (event: Y.YEvent<never>) => {
      try {
        const held = content.get(scope);
        if (!held) content.set(scope, readContent(options.schema, scope.content));
        else {
          const tr = new Transform(held);
          replayChange(
            { tr, schema: options.schema, at: -1 },
            event.deltaDeep as unknown as AnyDelta,
          );
          content.set(scope, tr.doc);
        }
      } catch {
        invalid.add(scope);
      }
    };
    scope.content.observeDeep(observer as never);
    return () => scope.content.unobserveDeep(observer as never);
  });
  const capture = (scope: RoomScope): GuardSnapshot => ({
    scope,
    content: content.get(scope) ?? null,
    anchors: captureGuardAnchors(scope, content.get(scope) ?? null),
    comments: readGuardRecords(scope.comments),
    meta: JSON.stringify([...readGuardRecords(scope.meta)]),
  });
  const remember = (transaction: Y.Transaction) =>
    before.set(transaction, options.scopes.map(capture));
  doc.on('beforeTransaction', remember);
  return {
    before: (transaction: Y.Transaction) => before.get(transaction),
    content: (scope: RoomScope) => (invalid.has(scope) ? undefined : content.get(scope)),
    /** Whether the kept reading of every scope equals a reading of its content from scratch. */
    verify: () =>
      options.scopes.every((scope) => {
        if (invalid.has(scope)) return false;
        const held = content.get(scope) ?? null;
        const fresh = readContent(options.schema, scope.content);
        return held === null || fresh === null ? held === fresh : held.eq(fresh);
      }),
    destroy() {
      for (const stop of stops) stop();
      doc.off('beforeTransaction', remember);
    },
  };
}
