import { parseKey, type RecordKey } from './comment-records.js';

export const fieldsOf = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const recordFields: Readonly<Record<string, readonly string[]>> = {
  thread: [
    'id',
    'quote',
    'suggestion',
    'state',
    'author',
    'createdAt',
    'updatedAt',
    'scope',
    'target',
    'change',
    'automatic',
    'agent',
    'meta',
  ],
  entry: ['id', 'author', 'text', 'createdAt', 'editedAt', 'agent', 'meta'],
  state: ['state', 'by', 'at'],
  decision: ['decision', 'suggestion', 'by', 'at', 'dependsOn'],
  quote: ['value', 'at'],
  target: ['value', 'at'],
  change: ['value', 'at'],
};
const hasOnly = (value: unknown, names: readonly string[]) =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => names.includes(key));

function isTarget(value: unknown): boolean {
  if (value === null) return true;
  if (!hasOnly(value, ['ranges', 'quote'])) return false;
  const { ranges, quote } = fieldsOf(value);
  if (typeof quote !== 'string' || !Array.isArray(ranges)) return false;
  return ranges.every((range) => {
    if (!hasOnly(range, ['element', 'start', 'end', 'text'])) return false;
    const { element, start, end, text } = fieldsOf(range);
    return (
      typeof element === 'string' &&
      typeof text === 'string' &&
      typeof start === 'number' &&
      Number.isFinite(start) &&
      start >= 0 &&
      typeof end === 'number' &&
      Number.isFinite(end) &&
      end >= start
    );
  });
}

function isChange(value: unknown): boolean {
  if (value === null) return true;
  if (!hasOnly(value, ['kind', 'inserted', 'deleted'])) return false;
  const { kind, inserted, deleted } = fieldsOf(value);
  return (
    ['insert', 'delete', 'replace', 'format'].includes(String(kind)) &&
    (inserted === undefined || typeof inserted === 'string') &&
    (deleted === undefined || typeof deleted === 'string')
  );
}

/** A field record must be readable rather than silently discarded by the discussion reader. */
export function isDiscussionField(kind: string, record: unknown): boolean {
  const value = fieldsOf(record);
  if (typeof value.at !== 'string') return false;
  if (kind === 'state')
    return (value.state === 'open' || value.state === 'resolved') && typeof value.by === 'string';
  if (kind === 'decision')
    return (
      (value.decision === 'accept' || value.decision === 'reject') &&
      typeof value.by === 'string' &&
      typeof value.suggestion === 'string'
    );
  if (kind === 'quote') return typeof value.value === 'string';
  return kind === 'target' ? isTarget(value.value) : isChange(value.value);
}

// The assistant a thread or a comment names is text, and the host's meta a record of its own.
function hasValidLabels(value: unknown): boolean {
  const { agent, meta } = fieldsOf(value);
  const isRecord = typeof meta === 'object' && meta !== null && !Array.isArray(meta);
  return (agent === undefined || typeof agent === 'string') && (meta === undefined || isRecord);
}

// A thread's or a comment's record names the id its key does, and its labels are well formed.
function hasRecordIdentity(key: RecordKey, value: unknown): boolean {
  if (key[0] === 'thread') return fieldsOf(value).id === key[1] && hasValidLabels(value);
  if (key[0] === 'entry') return fieldsOf(value).id === key[2] && hasValidLabels(value);
  return true;
}

/** Rejects dangling records and tombstones that hide records left underneath them. */
export function hasConsistentRecords(records: ReadonlyMap<string, unknown>): boolean {
  for (const [name, value] of records) {
    const key = parseKey(name);
    if (!key) return false;
    const [kind, thread] = key;
    if (!hasRecordIdentity(key, value)) return false;
    const allowed = recordFields[kind];
    if (allowed && !hasOnly(value, allowed)) return false;
    if (kind === 'removed') {
      if (value !== true) return false;
      continue;
    }
    if (records.has(JSON.stringify(['removed', thread]))) return false;
    if (!records.has(JSON.stringify(['thread', thread]))) return false;
    if (kind === 'reaction' && key[2] && !records.has(JSON.stringify(['entry', thread, key[2]])))
      return false;
  }
  return true;
}

function hasInitialThreadFields(record: Record<string, unknown>): boolean {
  const validScope =
    record.scope === undefined || record.scope === 'text' || record.scope === 'document';
  const validSuggestion = record.suggestion === null || typeof record.suggestion === 'string';
  return (
    validScope &&
    validSuggestion &&
    (record.automatic === undefined || typeof record.automatic === 'boolean') &&
    (record.updatedAt === undefined || typeof record.updatedAt === 'string')
  );
}

/** Initial thread records cannot smuggle a decision or resolved authorship into immutable data. */
export function isInitialThread(value: unknown): boolean {
  const record = fieldsOf(value);
  return (
    hasInitialThreadFields(record) &&
    record.state === 'open' &&
    record.decision === undefined &&
    record.resolvedBy === undefined &&
    record.resolvedAt === undefined &&
    typeof record.quote === 'string' &&
    (record.target === undefined || isTarget(record.target)) &&
    (record.change === undefined || isChange(record.change))
  );
}
