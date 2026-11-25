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
  // What an editor would show of a change the strict replay refused: the reading fitted to the
  // schema, for judging the writer's rights on it (DOCE-COLLAB-7.4).
  const fitted = new Map<RoomScope, Node>();
  const stops = options.scopes.map((scope) => {
    content.set(scope, readContent(options.schema, scope.content));
    const replay = (held: Node, delta: AnyDelta, strict: boolean) => {
      const tr = new Transform(held);
      replayChange({ tr, schema: options.schema, at: -1, strict, shared: scope.content }, delta);
      return tr.doc;
    };
    const fit = (held: Node | null | undefined, delta: AnyDelta) => {
      if (!held) return;
      try {
        const reading = replay(held, delta, false);
        reading.check();
        fitted.set(scope, reading);
      } catch {
        // Not even an editor could show it.
      }
    };
    const observer = (event: Y.YEvent<never>) => {
      const held = content.get(scope);
      const delta = event.deltaDeep as unknown as AnyDelta;
      try {
        content.set(
          scope,
          held ? replay(held, delta, true) : readContent(options.schema, scope.content),
        );
      } catch {
        invalid.add(scope);
        fit(held, delta);
      }
    };
    scope.content.observeDeep(observer as never);
    return () => scope.content.unobserveDeep(observer as never);
  });
  const capture = (scope: RoomScope): GuardSnapshot => ({
    scope,
    content: content.get(scope) ?? null,
    // A reading the replay could not keep matches the shared content no more: its anchors cannot
    // be placed, and the change is judged on the fitted reading or refused (DOCE-COLLAB-7.4).
    anchors: invalid.has(scope) ? [] : captureGuardAnchors(scope, content.get(scope) ?? null),
    comments: readGuardRecords(scope.comments),
    meta: JSON.stringify([...readGuardRecords(scope.meta)]),
  });
  const remember = (transaction: Y.Transaction) =>
    before.set(transaction, options.scopes.map(capture));
  doc.on('beforeTransaction', remember);
  return {
    before: (transaction: Y.Transaction) => before.get(transaction),
    content: (scope: RoomScope) => (invalid.has(scope) ? undefined : content.get(scope)),
    /** The reading fitted to the schema of a change the strict replay refused, if one could be. */
    fitted: (scope: RoomScope) => (invalid.has(scope) ? fitted.get(scope) : undefined),
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
