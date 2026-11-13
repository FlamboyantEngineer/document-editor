// The records a shared room's `comments` type keeps (decision D29), and the threads read from
// them. Anyone who may comment writes that type, and an older editor may have written it too, so
// every value is read as untrusted: a record that is not one of its kind is left out, and never
// stops the others from being read.

import type * as Y from '@y/y';
import type {
  CommentChange,
  CommentDecision,
  CommentEntry,
  CommentTarget,
  CommentTargetRange,
  CommentThread,
} from '../host/index.js';

/** The attributes of the `comments` type, by kind: a thread, one of its comments, a reaction. */
export type RecordKey =
  | readonly ['thread', string]
  | readonly ['entry', string, string]
  | readonly ['reaction', string, string, string, string];

type Fields = Record<string, unknown>;

const KEY_LENGTHS: Record<string, number> = { thread: 2, entry: 3, reaction: 5 };

const CHANGE_KINDS: ReadonlySet<unknown> = new Set(['insert', 'delete', 'replace', 'format']);

/** A record's attribute name. */
export const keyOf = (key: RecordKey): string => JSON.stringify(key);

/** The record an attribute name is the key of; null for any other name. */
export function parseKey(name: string): RecordKey | null {
  try {
    const key: unknown = JSON.parse(name);
    if (!Array.isArray(key) || !key.every((part) => typeof part === 'string')) return null;
    return KEY_LENGTHS[String(key[0])] === key.length ? (key as unknown as RecordKey) : null;
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
  if (!CHANGE_KINDS.has(kind)) return null;
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

// The comment a record under a comment's key holds; null for a value that is not such a record.
function entryOf(id: string, value: unknown): CommentEntry | null {
  const { author, text, createdAt, editedAt } = fieldsOf(value) ?? {};
  if (typeof author !== 'string' || typeof text !== 'string' || typeof createdAt !== 'string')
    return null;
  return plain({ id, author, text, createdAt, editedAt: textOf(editedAt) });
}

function addReaction(
  reactions: Record<string, string[]> | undefined,
  { emoji, person }: { emoji: string; person: string },
): Record<string, string[]> {
  const next = { ...reactions };
  next[emoji] = [...(next[emoji] ?? []), person].sort();
  return next;
}

/** Every thread the `comments` type holds, comments oldest first. */
export function readRoomThreads(type: Y.Type): CommentThread[] {
  const threads = new Map<string, CommentThread>();
  const entries = new Map<string, CommentEntry>();
  const reactions: (readonly [string, string, string, string])[] = [];
  type.forEachAttr((value: unknown, name: string | number) => {
    const key = parseKey(String(name));
    if (key?.[0] === 'thread') {
      const thread = threadOf(key[1], value);
      if (thread) threads.set(key[1], thread);
    }
    if (key?.[0] === 'entry') {
      const entry = entryOf(key[2], value);
      if (entry) entries.set(keyOf(key), entry);
    }
    if (key?.[0] === 'reaction') reactions.push([key[1], key[2], key[3], key[4]]);
  });
  for (const [threadId, entryId, emoji, person] of reactions) {
    const target = entryId
      ? entries.get(keyOf(['entry', threadId, entryId]))
      : threads.get(threadId);
    if (target) target.reactions = addReaction(target.reactions, { emoji, person });
  }
  for (const [name, entry] of entries) {
    const key = parseKey(name);
    if (key?.[0] === 'entry') threads.get(key[1])?.entries.push(entry);
  }
  for (const thread of threads.values()) {
    thread.entries.sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
  }
  return [...threads.values()];
}
