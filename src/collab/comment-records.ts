// The records a shared room's `comments` type keeps (decision D29), and the threads read from
// them. A thread's record is written once, when the thread starts; each field of it that changes
// later, each comment and each reaction is an attribute of its own, so what two people change at
// once in one thread both stays. Anyone who may comment writes that type, and an older editor may
// have written it too, so every value is read as untrusted: a record that is not one of its kind
// is left out, and never stops the others from being read.

import type * as Y from '@y/y';
import type {
  CommentChange,
  CommentDecision,
  CommentEntry,
  CommentTarget,
  CommentTargetRange,
  CommentThread,
} from '../host/index.js';

/** A field of a thread that changes after it starts, kept apart from the thread's record. */
export type ThreadFieldKind = 'state' | 'decision' | 'quote' | 'target' | 'change';

/**
 * The attributes of the `comments` type, by kind: a thread, a field of it set since, the mark of a
 * removed thread, one of its comments, a reaction.
 */
export type RecordKey =
  | readonly ['thread' | ThreadFieldKind | 'removed', string]
  | readonly ['entry', string, string]
  | readonly ['reaction', string, string, string, string];

type Fields = Record<string, unknown>;

const keyLengths: Record<string, number> = {
  thread: 2,
  state: 2,
  decision: 2,
  quote: 2,
  target: 2,
  change: 2,
  removed: 2,
  entry: 3,
  reaction: 5,
};

const changeKinds: ReadonlySet<unknown> = new Set(['insert', 'delete', 'replace', 'format']);

/** A record's attribute name. */
export const keyOf = (key: RecordKey): string => JSON.stringify(key);

/** The record an attribute name is the key of; null for any other name. */
export function parseKey(name: string): RecordKey | null {
  try {
    const key: unknown = JSON.parse(name);
    if (!Array.isArray(key) || !key.every((part) => typeof part === 'string')) return null;
    return keyLengths[String(key[0])] === key.length ? (key as unknown as RecordKey) : null;
  } catch {
    return null;
  }
}

/** A record without the fields that hold nothing, as the shared document keeps plain values only. */
export function plain<T extends object>(record: T): T {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T;
}

const fieldsOf = (value: unknown): Fields | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Fields) : null;

const textOf = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

function rangeOf(value: unknown): CommentTargetRange | null {
  const { element, start, end, text } = fieldsOf(value) ?? {};
  if (typeof element !== 'string' || typeof text !== 'string') return null;
  if (typeof start !== 'number' || typeof end !== 'number') return null;
  return { element, start, end, text };
}

// A stored value that may be absent (undefined), cleared (null) or a record of its kind, read by
// `read`; one that is none of these counts as absent.
function optional<T>(value: unknown, read: (fields: Fields) => T | null): T | null | undefined {
  if (value === null) return null;
  const fields = fieldsOf(value);
  return (fields && read(fields)) ?? undefined;
}

function targetOf({ ranges, quote }: Fields): CommentTarget | null {
  if (!Array.isArray(ranges) || typeof quote !== 'string') return null;
  const read = ranges.map(rangeOf);
  return read.every((range) => range !== null) ? { ranges: read, quote } : null;
}

function changeOf({ kind, inserted, deleted }: Fields): CommentChange | null {
  if (!changeKinds.has(kind)) return null;
  return plain({
    kind: kind as CommentChange['kind'],
    inserted: textOf(inserted),
    deleted: textOf(deleted),
  });
}

function decisionOf({ decision, suggestion, by, at, dependsOn }: Fields): CommentDecision | null {
  if (decision !== 'accept' && decision !== 'reject') return null;
  if (typeof suggestion !== 'string' || typeof by !== 'string' || typeof at !== 'string')
    return null;
  return plain<CommentDecision>({ decision, suggestion, by, at, dependsOn: textOf(dependsOn) });
}

// The thread a record under a thread's key holds: the thread its key names, whatever id the record
// gives, with what it quotes; null for a value that is not such a record.
function threadOf(id: string, value: unknown): CommentThread | null {
  const fields = fieldsOf(value);
  if (!fields || typeof fields.quote !== 'string') return null;
  return plain<CommentThread>({
    id,
    state: fields.state === 'resolved' ? 'resolved' : 'open',
    quote: fields.quote,
    suggestion: textOf(fields.suggestion) ?? null,
    entries: [],
    scope: fields.scope === 'text' || fields.scope === 'document' ? fields.scope : undefined,
    target: optional(fields.target, targetOf),
    author: textOf(fields.author),
    createdAt: textOf(fields.createdAt),
    updatedAt: textOf(fields.updatedAt),
    resolvedBy: textOf(fields.resolvedBy),
    resolvedAt: textOf(fields.resolvedAt),
    change: optional(fields.change, changeOf),
    decision: optional(fields.decision, decisionOf),
    automatic: fields.automatic === true ? true : undefined,
  });
}

/** The comment a record under a comment's key holds; null for a value that is not such a record. */
export function entryOf(id: string, value: unknown): CommentEntry | null {
  const { author, text, createdAt, editedAt } = fieldsOf(value) ?? {};
  if (typeof author !== 'string' || typeof text !== 'string' || typeof createdAt !== 'string')
    return null;
  return plain({ id, author, text, createdAt, editedAt: textOf(editedAt) });
}

// A thread changed at `at`, when that is later than its record says.
function touch(thread: CommentThread, at: unknown): void {
  if (typeof at === 'string' && at > (thread.updatedAt ?? '')) thread.updatedAt = at;
}

// Sets a thread's field from the record kept apart for it, which says when it was set; a record
// that does not hold the field leaves the thread as its own record has it.
const fieldReaders: Record<ThreadFieldKind, (thread: CommentThread, fields: Fields) => void> = {
  state(thread, { state, by, at }) {
    if (state !== 'open' && state !== 'resolved') return;
    thread.state = state;
    thread.resolvedBy = state === 'resolved' ? textOf(by) : undefined;
    thread.resolvedAt = state === 'resolved' ? textOf(at) : undefined;
    touch(thread, at);
  },
  decision(thread, fields) {
    const decision = decisionOf(fields);
    if (!decision) return;
    thread.decision = decision;
    touch(thread, decision.at);
  },
  quote(thread, { value, at }) {
    if (typeof value !== 'string') return;
    thread.quote = value;
    touch(thread, at);
  },
  target(thread, { value, at }) {
    const target = optional(value, targetOf);
    if (target === undefined) return;
    thread.target = target;
    touch(thread, at);
  },
  change(thread, { value, at }) {
    const change = optional(value, changeOf);
    if (change === undefined) return;
    thread.change = change;
    touch(thread, at);
  },
};

const isFieldKind = (kind: RecordKey[0]): kind is ThreadFieldKind =>
  Object.hasOwn(fieldReaders, kind);

function addReaction(
  reactions: Record<string, string[]> | undefined,
  { emoji, person }: { emoji: string; person: string },
): Record<string, string[]> {
  const next = { ...reactions };
  next[emoji] = [...(next[emoji] ?? []), person].sort();
  return next;
}

type Stored = readonly [key: RecordKey, value: unknown];

function recordsOf(type: Y.Type): Stored[] {
  const records: Stored[] = [];
  type.forEachAttr((value: unknown, name: string | number) => {
    const key = parseKey(String(name));
    if (key) records.push([key, value]);
  });
  return records;
}

// The threads by id, each as its record has it with the fields set since; a removed thread is
// left out even when a record of it was written again, as by a change made while it was removed.
function threadsOf(records: readonly Stored[]): Map<string, CommentThread> {
  const removed = new Set(records.flatMap(([key]) => (key[0] === 'removed' ? [key[1]] : [])));
  const threads = new Map<string, CommentThread>();
  for (const [key, value] of records) {
    const thread = key[0] === 'thread' && !removed.has(key[1]) ? threadOf(key[1], value) : null;
    if (thread) threads.set(thread.id, thread);
  }
  for (const [[kind, id], value] of records) {
    const thread = threads.get(id);
    const fields = fieldsOf(value);
    if (thread && fields && isFieldKind(kind)) fieldReaders[kind](thread, fields);
  }
  return threads;
}

// The comments by thread, then by id.
function entriesOf(records: readonly Stored[]): Map<string, Map<string, CommentEntry>> {
  const entries = new Map<string, Map<string, CommentEntry>>();
  for (const [key, value] of records) {
    const entry = key[0] === 'entry' ? entryOf(key[2], value) : null;
    if (!entry) continue;
    const ofThread = entries.get(key[1]) ?? new Map<string, CommentEntry>();
    entries.set(key[1], ofThread.set(entry.id, entry));
  }
  return entries;
}

/** Every thread the `comments` type holds, comments oldest first. */
export function readRoomThreads(type: Y.Type): CommentThread[] {
  const records = recordsOf(type);
  const threads = threadsOf(records);
  const entries = entriesOf(records);
  for (const [key] of records) {
    if (key[0] !== 'reaction') continue;
    const [, threadId, entryId, emoji, person] = key;
    const target = entryId ? entries.get(threadId)?.get(entryId) : threads.get(threadId);
    if (target) target.reactions = addReaction(target.reactions, { emoji, person });
  }
  return [...threads.values()].map((thread) => {
    const listed = [...(entries.get(thread.id)?.values() ?? [])];
    listed.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    return plain({ ...thread, entries: listed });
  });
}
