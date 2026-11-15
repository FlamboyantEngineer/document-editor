import type { EditorCapabilities } from '../host/capabilities.js';
import { entryOf, parseKey, type RecordKey } from './comment-records.js';
import {
  fieldsOf as fields,
  hasConsistentRecords,
  isDiscussionField,
  isInitialThread,
} from './guard-records.js';

export interface GuardPermissions extends Pick<
  EditorCapabilities,
  'edit' | 'suggest' | 'comment' | 'decide'
> {
  /** Host-granted exception for moderating another person's discussions. */
  manageComments?: boolean | undefined;
  /** Trusted restore/import may preserve foreign proposal attribution. */
  manageProposals?: boolean | undefined;
}

interface CommentGuardOptions {
  before: ReadonlyMap<string, unknown>;
  after: ReadonlyMap<string, unknown>;
  actor: string;
  permissions: GuardPermissions;
}

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const nameOf = (kind: string, thread: string) => JSON.stringify([kind, thread]);

function ownsThread(thread: string, options: CommentGuardOptions): boolean {
  const record =
    options.before.get(nameOf('thread', thread)) ?? options.after.get(nameOf('thread', thread));
  return options.permissions.manageComments === true || fields(record).author === options.actor;
}

function removingThread(thread: string, options: CommentGuardOptions): boolean {
  return (
    ownsThread(thread, options) &&
    options.after.get(nameOf('removed', thread)) === true &&
    !options.after.has(nameOf('thread', thread))
  );
}

function checkEntry(
  key: readonly ['entry', string, string],
  options: CommentGuardOptions,
): boolean {
  const { before, after, actor, permissions } = options;
  const name = JSON.stringify(key);
  const previous = entryOf(key[2], before.get(name));
  const next = after.get(name);
  const current = entryOf(key[2], next);
  if (next === undefined)
    return (
      removingThread(key[1], options) ||
      previous?.author === actor ||
      permissions.manageComments === true
    );
  if (!after.has(nameOf('thread', key[1])) || after.has(nameOf('removed', key[1]))) return false;
  if (previous && previous.author !== actor && !permissions.manageComments) return false;
  return (
    current !== null &&
    current.author === (previous?.author ?? actor) &&
    (!previous || current.createdAt === previous.createdAt)
  );
}

function checkThread(key: RecordKey, options: CommentGuardOptions): boolean {
  const { before, after, actor } = options;
  const name = JSON.stringify(key);
  const was = before.get(name);
  const next = after.get(name);
  if (was !== undefined) return next === undefined && removingThread(key[1], options);
  if (before.has(nameOf('removed', key[1])) || after.has(nameOf('removed', key[1]))) return false;
  return (
    fields(next).author === actor &&
    typeof fields(next).createdAt === 'string' &&
    typeof fields(next).quote === 'string' &&
    isInitialThread(next)
  );
}

function checkOwnedField(key: RecordKey, options: CommentGuardOptions): boolean {
  const { before, after, actor } = options;
  const next = after.get(JSON.stringify(key));
  if (key[0] === 'removed') return next === true && removingThread(key[1], options);
  if (!after.has(nameOf('thread', key[1])))
    return next === undefined && removingThread(key[1], options);
  if (after.has(nameOf('removed', key[1]))) return false;
  if (next !== undefined && !isDiscussionField(key[0], next)) return false;
  if (key[0] === 'state') return next === undefined || fields(next).by === actor;
  if (key[0] === 'decision')
    return (
      options.permissions.decide &&
      (next === undefined
        ? fields(before.get(JSON.stringify(key))).by === actor
        : fields(next).by === actor)
    );
  return ownsThread(key[1], options) && (next === undefined || typeof fields(next).at === 'string');
}

function checkReaction(
  key: readonly ['reaction', string, string, string, string],
  options: CommentGuardOptions,
): boolean {
  const { after, actor } = options;
  const next = after.get(JSON.stringify(key));
  if (next === undefined && removingThread(key[1], options)) return true;
  const entryName = JSON.stringify(['entry', key[1], key[2]]);
  if (
    next === undefined &&
    !after.has(entryName) &&
    fields(options.before.get(entryName)).author === actor
  )
    return true;
  if (!after.has(nameOf('thread', key[1])) || after.has(nameOf('removed', key[1]))) return false;
  if (key[2] && !after.has(JSON.stringify(['entry', key[1], key[2]]))) return next === undefined;
  return key[4] === actor && (next === true || next === undefined);
}

function isDecisionState(key: RecordKey, options: CommentGuardOptions): boolean {
  if (key[0] !== 'state' || !options.permissions.decide) return false;
  const decisionName = nameOf('decision', key[1]);
  const decision = options.after.get(decisionName);
  const state = fields(options.after.get(JSON.stringify(key)));
  return (
    !equal(decision, options.before.get(decisionName)) &&
    fields(decision).by === options.actor &&
    state.state === 'resolved' &&
    state.by === options.actor
  );
}

function checkRecord(name: string, options: CommentGuardOptions): boolean {
  const { before, after, permissions } = options;
  const next = after.get(name);
  if (equal(before.get(name), next)) return true;
  const key = parseKey(name);
  if (!key) return false;
  if (key[0] === 'decision') return checkOwnedField(key, options);
  if (!permissions.comment) return isDecisionState(key, options) && checkOwnedField(key, options);
  if (key[0] === 'entry') return checkEntry(key, options);
  if (key[0] === 'thread') return checkThread(key, options);
  if (key[0] === 'reaction') return checkReaction(key, options);
  return checkOwnedField(key, options);
}

/** Enforces immutable attribution and ownership on independently encoded discussion records. */
export function checkCommentChanges(options: CommentGuardOptions): boolean {
  return (
    hasConsistentRecords(options.after) &&
    [...new Set([...options.before.keys(), ...options.after.keys()])].every((name) =>
      checkRecord(name, options),
    )
  );
}
