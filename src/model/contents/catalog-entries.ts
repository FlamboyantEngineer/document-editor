// Filters and orders catalog entries, reading a footnote where its marker appears.

import type { CatalogEntry, ContentsKind, DocumentCatalog } from './contents-kinds.js';

// Each kind's entries: after the first table of contents if it asks, without those it drops, then
// its first one of each identity alone if it asks, in the order it asks, group by group if it groups them.
export function arrangeEntries(
  catalog: DocumentCatalog,
  kinds: Readonly<Record<string, ContentsKind>>,
  {
    firstContents,
    markerPositions,
  }: {
    readonly firstContents: number | null;
    readonly markerPositions: ReadonlyMap<CatalogEntry, number>;
  },
): DocumentCatalog {
  const readingPosition = (entry: CatalogEntry) => markerPositions.get(entry) ?? entry.pos;
  return Object.fromEntries(
    Object.entries(catalog).map(([key, entries]) => {
      const kind = kinds[key];
      let arranged = [...entries];
      arranged.sort(
        (left, right) => readingPosition(left) - readingPosition(right) || left.pos - right.pos,
      );
      if (kind?.after && firstContents !== null) {
        arranged = arranged.filter((entry) => readingPosition(entry) > firstContents);
      }
      if (kind?.drop) arranged = kind.drop(arranged);
      if (kind?.unique) {
        const seen = new Set<string>();
        arranged = arranged.filter((entry) => {
          const key = entry.identity ?? `${entry.number}\u0000${entry.text}`;
          return !seen.has(key) && seen.add(key);
        });
      }
      if (kind?.sort) arranged.sort(kind.sort);
      if (kind?.group) arranged.sort(byGroup(kind.groups ?? []));
      return [key, arranged];
    }),
  );
}

// Orders entries group by group, the groups a kind names first, in its order, then the others by
// their names; an entry keeps its place in its group.
function byGroup(groups: readonly string[]) {
  const rank = (entry: CatalogEntry) => {
    const index = groups.indexOf(entry.group ?? '');
    return index < 0 ? groups.length : index;
  };
  return (a: CatalogEntry, b: CatalogEntry) =>
    rank(a) - rank(b) || (a.group ?? '').localeCompare(b.group ?? '');
}
