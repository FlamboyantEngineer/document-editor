// Comparing stored values, such as two versions of a block, by what they hold.

// JSON text with object keys sorted, so two values compare equal whatever order they were built in.
function stableKey(value: unknown): string {
  return JSON.stringify(value, (_key, each: unknown) =>
    each && typeof each === 'object' && !Array.isArray(each)
      ? Object.fromEntries(Object.entries(each).sort(([a], [b]) => (a < b ? -1 : 1)))
      : each,
  );
}

/** Whether two stored values hold the same content, whatever order their keys are in. */
export const sameStored = (one: unknown, other: unknown): boolean =>
  stableKey(one) === stableKey(other);
