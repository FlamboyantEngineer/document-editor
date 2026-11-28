/** JSON text with object keys sorted and arrays in their original order. */
export function stableKey(value: unknown): string {
  return JSON.stringify(value, (_key, each: unknown) =>
    each && typeof each === 'object' && !Array.isArray(each)
      ? Object.fromEntries(Object.entries(each).sort(([a], [b]) => (a < b ? -1 : 1)))
      : each,
  );
}
