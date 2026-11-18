// A table suggested whole: the editor holds the suggestion on the table's holder (`table_figure`),
// which is not stored, and the stored format keeps it on the table, with an insertion's writer as
// the table's writer.

import type { StoredNode } from './document-format.js';

type Attrs = Record<string, unknown>;

/**
 * A stored table's attributes, apart from the suggestion of the whole table, and that suggestion
 * as its holder's attributes.
 */
export function holderAttrsOf(stored: unknown): { holder: Attrs; table: unknown } {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    return { holder: {}, table: stored };
  }
  const { suggestionKind, suggestionId, ...table } = stored as Attrs;
  if (typeof suggestionKind !== 'string' || typeof suggestionId !== 'string') {
    return { holder: {}, table: stored };
  }
  const author = suggestionKind === 'insertion' ? table.author : null;
  return {
    holder: {
      suggestionSplitKind: suggestionKind,
      suggestionSplitId: suggestionId,
      dataAuthor: typeof author === 'string' ? author : null,
    },
    table,
  };
}

/** The stored table's attributes with the suggestion its holder carries, if any. */
export function withTableSuggestion(
  stored: StoredNode['attrs'],
  holder: Attrs,
): StoredNode['attrs'] {
  const { suggestionSplitKind: kind, suggestionSplitId: id, dataAuthor } = holder;
  if (typeof kind !== 'string' || typeof id !== 'string') return stored;
  const author =
    kind === 'insertion' && typeof dataAuthor === 'string' ? { author: dataAuthor } : {};
  return { ...stored, ...author, suggestionKind: kind, suggestionId: id };
}
