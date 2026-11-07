// Stored values as text, the way the document's earlier implementation read them: a string as it
// is, any other value as JavaScript writes it in a template string.

/** A stored value as text, or null when there is none. */
export function storedText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  // The cast keeps JavaScript's own conversion, `[object Object]` for an object included.
  return typeof value === 'string' ? value : String(value as string);
}

/** A stored value as text, or an empty string when there is none. */
export function textOf(value: unknown): string {
  return storedText(value) ?? '';
}
