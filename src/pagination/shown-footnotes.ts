// The footnotes whose entries a layout's earlier pages hold, and a key for them that a page starting
// after them records (DOCE-PAGINATION-5.5): kept as it grows, so a page's key costs nothing however
// many footnotes come before it, and alike for the same footnotes in any order.

/** The footnotes earlier pages show, by id, with a key naming them. */
export interface ShownFootnotes {
  has(id: string): boolean;
  add(id: string): void;
  /** The same for the same footnotes, whatever order they were added in. */
  readonly key: string;
}

// Two FNV-1a hashes of an id, 32 bits each, from different offsets.
function hashes(id: string): [number, number] {
  let first = 0x811c9dc5;
  let second = 0x01000193;
  for (let index = 0; index < id.length; index += 1) {
    const code = id.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x01000193) >>> 0;
  }
  return [first, second];
}

/** No footnotes shown yet. */
export function createShownFootnotes(): ShownFootnotes {
  const ids = new Set<string>();
  // The hashes' sum and exclusive or over the ids, which do not depend on their order.
  let sum = 0;
  let mixed = 0;
  return {
    has: (id) => ids.has(id),
    add(id) {
      if (ids.has(id)) return;
      ids.add(id);
      const [first, second] = hashes(id);
      sum = (sum + first) >>> 0;
      mixed = (mixed ^ second) >>> 0;
    },
    get key() {
      return ids.size ? `${String(ids.size)}:${sum.toString(16)}:${mixed.toString(16)}` : '';
    },
  };
}
