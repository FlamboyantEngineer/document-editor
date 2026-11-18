// Who accepted text is credited to: its writer, or, for generated text, the person who accepts it,
// still marked with the session that generated it (DOCE-SUGGESTIONS-2.7).

import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';

// The session a contributor mark names, which marks its text as generated, or null.
const sessionOf = (mark: Mark | undefined): string | null => {
  const session: unknown = mark?.attrs.dataAiSession;
  return typeof session === 'string' && session ? session : null;
};

/**
 * Keeps who wrote accepted text: inserted text that names no contributor takes its suggester, and
 * generated text, whose contributor names a session, is credited to the person who accepts it,
 * keeping the session.
 */
export function keepAuthor(
  tr: Transaction,
  { node, pos }: { node: ProseMirrorNode; pos: number },
  { author, decider }: { author: string | null; decider: string | null },
) {
  const { contributor } = tr.doc.type.schema.marks;
  if (!contributor) return;
  const named = contributor.isInSet(node.marks);
  const session = sessionOf(named);
  let credited: Mark | null = null;
  if (!named && author) credited = contributor.create({ dataAuthor: author });
  else if (session && decider && named?.attrs.dataAuthor !== decider)
    credited = contributor.create({ dataAuthor: decider, dataAiSession: session });
  if (credited) tr.addMark(pos, pos + node.nodeSize, credited);
}
