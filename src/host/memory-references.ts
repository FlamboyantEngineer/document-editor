// The in-memory host's reference source: the citations of other documents it is given, found by
// their labels, and the targets each cited document holds.

import type { ReferenceTargetBaseline } from '../model/reference-format.js';
import type { ExternalReference, ReferenceSourceAdapter } from './adapters.js';
import { notFound } from './memory-documents.js';

/** Whether any of the values holds the query, ignoring case. */
export const matchesQuery = (query: string, ...values: string[]): boolean => {
  const wanted = query.trim().toLowerCase();
  return values.some((value) => value.toLowerCase().includes(wanted));
};

/**
 * Finds citations of other documents among those it is given, and the targets each document holds;
 * a citation of a target resolves while its document holds it, and is broken once it does not.
 */
export function createMemoryReferences({
  citations = [],
  citationTargets = {},
}: {
  citations?: readonly ExternalReference[] | undefined;
  citationTargets?: Readonly<Record<string, readonly ReferenceTargetBaseline[]>> | undefined;
}): ReferenceSourceAdapter {
  const resolveOne = (documentId: string, targetId: string | null) => {
    const found = citations.find(({ baseline }) => baseline.documentId === documentId);
    if (!found) return null;
    const document = { ...structuredClone(found.baseline), target: null };
    if (targetId === null) return document;
    const target = citationTargets[documentId]?.find((each) => each.id === targetId);
    return target ? { ...document, target: structuredClone(target) } : ('broken' as const);
  };
  return {
    search: (query) =>
      Promise.resolve({
        ok: true,
        value: citations
          .filter((citation) => matchesQuery(query, citation.label))
          .map((citation) => structuredClone(citation)),
      }),
    resolve: (wanted) =>
      Promise.resolve({
        ok: true,
        value: wanted.map(({ documentId, targetId }) => resolveOne(documentId, targetId)),
      }),
    targets: (documentId) => {
      const targets = citationTargets[documentId];
      return Promise.resolve(
        targets ? { ok: true, value: structuredClone([...targets]) } : notFound(documentId),
      );
    },
  };
}
