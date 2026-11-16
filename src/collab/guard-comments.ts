import type { EditorCapabilities } from '../host/capabilities.js';
import { mayChangeComment } from '../host/comment-rules.js';
import type { CommentThread } from '../host/index.js';
import { entryOf, parseKey, readRecordThreads, type RecordKey } from './comment-records.js';
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
  /**
   * Host-granted exception for naming the assistant that wrote a thread or comment (`agent`) and
   * keeping the host's `meta` on it, as a host's assistant writing in the reader's name does.
   */
  labelAgents?: boolean | undefined;
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

// Whether a record keeps the assistant and the host's meta it had: only a writer the host lets
// label records (`labelAgents`) sets or changes them.
function keepsLabels(previous: unknown, next: unknown, options: CommentGuardOptions): boolean {
  if (options.permissions.labelAgents === true) return true;
  const [was, now] = [fields(previous), fields(next)];
  return equal(was.agent, now.agent) && equal(was.meta, now.meta);
}

// Whether a thread is deleted: a removal record says who deleted it and when.
const isDeleted = (records: ReadonlyMap<string, unknown>, thread: string) =>
  records.has(nameOf('removed', thread));

// The threads as they were before the change, read once for all the comments it changes.
const threadsBefore = new WeakMap<ReadonlyMap<string, unknown>, Map<string, CommentThread>>();
function threadBefore(thread: string, options: CommentGuardOptions): CommentThread | undefined {
  let threads = threadsBefore.get(options.before);
  if (!threads) {
    threads = new Map(readRecordThreads(options.before).map((each) => [each.id, each]));
    threadsBefore.set(options.before, threads);
  }
  return threads.get(thread);
}

// Deleting a thread: its owner, or a moderator, says once who deleted it and when; the thread and
// its comments stay as they are.
function checkRemoval(thread: string, options: CommentGuardOptions): boolean {
  const name = nameOf('removed', thread);
  const next = options.after.get(name);
  return (
    options.before.get(name) === undefined &&
    fields(next).by === options.actor &&
    options.after.has(nameOf('thread', thread)) &&
    ownsThread(thread, options)
  );
}

// A comment is written by its author, then changed or deleted only as `mayChangeComment` allows:
// by its author or a moderator. A deleted comment stays as a record of it, text and all, and is
// never taken out or changed again.
function checkEntry(
  key: readonly ['entry', string, string],
  options: CommentGuardOptions,
): boolean {
  const { before, after, actor, permissions } = options;
  const name = JSON.stringify(key);
  const previous = entryOf(key[2], before.get(name));
  const current = entryOf(key[2], after.get(name));
  if (!current || !after.has(nameOf('thread', key[1])) || isDeleted(after, key[1])) return false;
  if (!keepsLabels(before.get(name), after.get(name), options)) return false;
  if (!previous) return current.author === actor && current.deletedAt === undefined;
  const thread = threadBefore(key[1], options);
  const moderates = permissions.manageComments === true;
  if (!thread || !mayChangeComment(thread, previous, { me: actor, moderates })) return false;
  if (current.author !== previous.author || current.createdAt !== previous.createdAt) return false;
  if (current.deletedAt === undefined) return current.deletedBy === undefined;
  return (
    current.deletedBy === actor &&
    current.text === previous.text &&
    current.editedAt === previous.editedAt
  );
}

function checkThread(key: RecordKey, options: CommentGuardOptions): boolean {
  const { before, after, actor } = options;
  const name = JSON.stringify(key);
  const was = before.get(name);
  const next = after.get(name);
  // A thread's record is written once and kept, deleted or not.
  if (was !== undefined) return false;
  if (isDeleted(before, key[1]) || isDeleted(after, key[1])) return false;
  return (
    fields(next).author === actor &&
    keepsLabels(undefined, next, options) &&
    typeof fields(next).createdAt === 'string' &&
    typeof fields(next).quote === 'string' &&
    isInitialThread(next)
  );
}

function checkOwnedField(key: RecordKey, options: CommentGuardOptions): boolean {
  const { before, after, actor } = options;
  const next = after.get(JSON.stringify(key));
  if (key[0] === 'removed') return checkRemoval(key[1], options);
  if (!after.has(nameOf('thread', key[1])) || isDeleted(after, key[1])) return false;
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
  const { before, after, actor } = options;
  const next = after.get(JSON.stringify(key));
  if (!after.has(nameOf('thread', key[1])) || isDeleted(after, key[1])) return false;
  // The reactions to a deleted comment go with it, as whoever deletes it takes them; one to a
  // comment that is not there is only ever taken away.
  const entryName = JSON.stringify(['entry', key[1], key[2]]);
  const entry = after.get(entryName);
  if (key[2] && entry === undefined) return next === undefined;
  if (key[2] && fields(entry).deletedAt !== undefined)
    return (
      next === undefined &&
      (key[4] === actor ||
        (fields(entry).deletedBy === actor &&
          fields(before.get(entryName)).deletedAt === undefined))
    );
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
