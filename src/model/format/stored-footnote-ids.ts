// Footnote ids for a stored document read into the editor. The editor keeps a footnote's marker
// and its text together by id, so a footnote stored without one, as an import composes it, or with
// one an earlier footnote holds, is read with an id of its own: the first free one of the element
// id form, counting up, so the same file reads the same each time.

/** The footnote ids a read has given out, and those its stored document holds. */
export interface FootnoteIds {
  /** The id a footnote stored with `stored` reads with. */
  take(stored: unknown): string;
}

const footnoteIdOf = (node: Record<string, unknown>): unknown =>
  node.type === 'footnote' && node.attrs && typeof node.attrs === 'object'
    ? (node.attrs as Record<string, unknown>).id
    : undefined;

// Every footnote id stored anywhere in `value`.
function storedIds(value: unknown, into: Set<string>): Set<string> {
  if (Array.isArray(value)) for (const each of value) storedIds(each, into);
  else if (value && typeof value === 'object') {
    const node = value as Record<string, unknown>;
    const id = footnoteIdOf(node);
    if (typeof id === 'string') into.add(id);
    storedIds(node.content, into);
    storedIds(node.sections, into);
  }
  return into;
}

/** The footnote ids of a read of the stored `file`, or of stored content. */
export function createFootnoteIds(file: unknown): FootnoteIds {
  const held = storedIds(file, new Set());
  const given = new Set<string>();
  let next = 0;
  const fresh = () => {
    let id: string;
    do {
      next += 1;
      id = next.toString(16).padStart(8, '0');
    } while (held.has(id) || given.has(id));
    return id;
  };
  return {
    take(stored) {
      const id = typeof stored === 'string' && stored && !given.has(stored) ? stored : fresh();
      given.add(id);
      return id;
    },
  };
}
