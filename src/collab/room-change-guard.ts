import type * as Y from '@y/y';
import type { Node, Schema } from 'prosemirror-model';
import { hasGuardAnchors } from './guard-anchors.js';
import { checkCommentChanges, type GuardPermissions } from './guard-comments.js';
import { checkDocumentChange } from './guard-content.js';
import { hasGuardedShape } from './guard-shape.js';
import { type GuardSnapshot, readGuardRecords, watchGuardSnapshots } from './guard-snapshots.js';
import { resolveRoomScope, type RoomScope } from './room-scope.js';

/** Authoritative server admission attached to a candidate already applied to the server's shadow. */
export interface RoomGuardRequest {
  actor: { id: string };
  capabilities: ReadonlySet<string>;
  transaction: Y.Transaction;
}

/** Independent document permissions, with an explicit optional moderation exception. */
export type RoomPermissions = Readonly<GuardPermissions>;

export interface RoomChangeGuardOptions {
  schema: Schema;
  scope?: RoomScope | undefined;
  /** Every editable field in a shared room; unknown roots are refused. */
  scopes?: readonly RoomScope[] | undefined;
  /** Maps trusted server admission to document permissions, including business exceptions. */
  permissions(actor: { id: string }, capabilities: ReadonlySet<string>): RoomPermissions;
  /** Trusted suggestion-author mapping; null denies authoring without disabling decisions. */
  authorOf?: ((actor: { id: string }) => string | null) | undefined;
}

/**
 * A guard's answer: `true` takes the change, `false` refuses it for what the writer may not do, and
 * `'conflict'` refuses a change the writer may make whose merge with the room leaves content the
 * schema refuses (DOCE-COLLAB-7.4).
 */
type RoomGuardAnswer = boolean | 'conflict';

/** A room-server openGuard result, disposed when its shadow is replaced or unloaded. */
export interface RoomChangeGuard {
  check(change: RoomGuardRequest): RoomGuardAnswer;
  /**
   * Reads the shadow's content from scratch and says whether the guard's kept reading still
   * matches it; the room server calls it every `verifyEvery` changes and on idle.
   */
  verify(): boolean;
  destroy(): void;
}

// Judges a change on the content after it. A change whose exact replay the schema refuses is judged
// on the reading an editor fits from it: allowed there, it is a conflict of the merge, not of the
// writer's rights (DOCE-COLLAB-7.4).
function checkSnapshot(
  before: GuardSnapshot,
  options: {
    snapshots: ReturnType<typeof watchGuardSnapshots>;
    empty: Node;
    actor: string;
    author: string | null;
    permissions: GuardPermissions;
  },
): RoomGuardAnswer {
  const exact = options.snapshots.content(before.scope);
  const after = exact === undefined ? options.snapshots.fitted(before.scope) : exact;
  if (after === undefined) return false;
  after?.check();
  if (!allowedChange(before, after, options)) return false;
  return exact === undefined ? 'conflict' : true;
}

function allowedChange(
  before: GuardSnapshot,
  after: Node | null,
  options: {
    empty: Node;
    actor: string;
    author: string | null;
    permissions: GuardPermissions;
  },
): boolean {
  const { scope } = before;
  const { permissions, actor, author } = options;
  if (!hasGuardAnchors(before.anchors, after, { scope, actor: author, permissions })) return false;
  const version: unknown = scope.meta.getAttr('formatVersion');
  if (version !== undefined && version !== 1) return false;
  if (!permissions.edit && before.meta !== JSON.stringify([...readGuardRecords(scope.meta)]))
    return false;
  const contentAllowed = checkDocumentChange({
    before: before.content ?? options.empty,
    after: after ?? options.empty,
    actor: author,
    permissions,
  });
  return (
    contentAllowed &&
    checkCommentChanges({
      before: before.comments,
      after: readGuardRecords(scope.comments),
      actor,
      permissions,
    })
  );
}

/** Validates candidates on a persistent server-owned shadow before broadcast or persistence. */
export function openRoomChangeGuard(
  shadow: Y.Doc,
  options: RoomChangeGuardOptions,
): RoomChangeGuard {
  const scopes = (options.scopes ?? [options.scope]).map((scope) =>
    resolveRoomScope(shadow, scope),
  );
  const allowed = new Set(scopes.flatMap((scope) => [scope.content, scope.meta, scope.comments]));
  const empty = options.schema.topNodeType.createAndFill();
  if (!empty) throw new Error('The schema cannot create a neutral document.');
  const snapshots = watchGuardSnapshots(shadow, { scopes, schema: options.schema });
  let destroyed = false;
  return {
    check(change) {
      if (destroyed) return false;
      try {
        for (let root of change.transaction.changed.keys()) {
          while (root.parent) root = root.parent;
          if (!allowed.has(root)) return false;
        }
        if (!hasGuardedShape(change.transaction, { scopes, schema: options.schema })) return false;
        const before = snapshots.before(change.transaction);
        if (!before) return false;
        const permissions = options.permissions(change.actor, change.capabilities);
        const author = options.authorOf ? options.authorOf(change.actor) : change.actor.id;
        const answers = before.map((snapshot) =>
          checkSnapshot(snapshot, {
            snapshots,
            empty,
            actor: change.actor.id,
            author,
            permissions,
          }),
        );
        if (answers.includes(false)) return false;
        return answers.includes('conflict') ? 'conflict' : true;
      } catch {
        return false;
      }
    },
    verify: () => !destroyed && snapshots.verify(),
    destroy() {
      destroyed = true;
      snapshots.destroy();
    },
  };
}
