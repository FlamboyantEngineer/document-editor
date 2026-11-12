// Who wrote each run of text: every local insert carries its writer's contributor mark, for a
// person or an automated session. The contributor mark is inclusive, so text typed right after
// another writer's would take theirs; each insert is marked again as its own writer's, or left
// unmarked when the editor knows no writer, so an agent's attribution never bleeds into a person's
// typing.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import { automationActor } from './automation.js';
import { isLocalEdit, isRemoteTransaction } from './transaction-kind.js';

/** Who writes the local changes: a person, or an automated session acting for one. */
export interface Contributor {
  /** The writer's id. */
  readonly author: string;
  /** The automated session that writes, or null for the person themselves. */
  readonly aiSession?: string | null | undefined;
}

/** How `markContributors` marks who wrote the text. */
export interface ContributorMarksOptions {
  /** Who writes the local changes, or null when the editor knows no writer. */
  contributor?: (() => Contributor | null) | undefined;
  /** Whether a transaction came from elsewhere, such as a collaborator or the server. */
  isRemote?: ((tr: Transaction) => boolean) | undefined;
}

/** A range of the document a change inserted. */
interface Inserted {
  from: number;
  to: number;
}

// The ranges each of the writer's own changes inserted, in the document after every change.
function insertedRanges(transactions: readonly Transaction[], own: (tr: Transaction) => boolean) {
  const ranges: Inserted[] = [];
  transactions.forEach((tr, index) => {
    if (!own(tr)) return;
    const later = transactions.slice(index + 1);
    tr.steps.forEach((step, stepIndex) => {
      if (!(step instanceof ReplaceStep) || step.slice.size === 0) return;
      const rest = tr.mapping.slice(stepIndex + 1);
      let from = rest.map(step.from, 1);
      let to = rest.map(step.from + step.slice.size, -1);
      for (const next of later) {
        from = next.mapping.map(from, 1);
        to = next.mapping.map(to, -1);
      }
      if (to > from) ranges.push({ from, to });
    });
  });
  return ranges;
}

// Whether a range's text is all marked as the writer's already.
function isMarked(doc: ProseMirrorNode, range: Inserted, writer: Contributor) {
  let marked = true;
  doc.nodesBetween(range.from, range.to, (node) => {
    if (!node.isText || !marked) return marked;
    const own = node.marks.find((each) => each.type.name === 'contributor');
    marked =
      own?.attrs.dataAuthor === writer.author &&
      (own.attrs.dataAiSession ?? null) === (writer.aiSession ?? null);
    return false;
  });
  return marked;
}

/**
 * Marks the text the writer's own changes inserted as the writer's (D1), in `tr`, a change to the
 * document after them: with the contributor's mark, or with none when there is no contributor.
 * Remote, derived and system changes, changes out of the history, and the automation API's, which
 * marks its own text, are left as they are. Gives whether it changed anything.
 */
export function markContributors(
  tr: Transaction,
  transactions: readonly Transaction[],
  { contributor = () => null, isRemote = isRemoteTransaction }: ContributorMarksOptions = {},
): boolean {
  const type = tr.doc.type.schema.marks.contributor;
  if (!type) return false;
  const own = (each: Transaction) =>
    isLocalEdit(each, isRemote) && each.getMeta('addToHistory') !== false && !automationActor(each);
  const ranges = insertedRanges(transactions, own);
  if (!ranges.length) return false;
  const writer = contributor();
  const steps = tr.steps.length;
  for (const range of ranges) {
    if (writer && isMarked(tr.doc, range, writer)) continue;
    tr.removeMark(range.from, range.to, type);
    if (writer) {
      const attrs = { dataAuthor: writer.author, dataAiSession: writer.aiSession ?? null };
      tr.addMark(range.from, range.to, type.create(attrs));
    }
  }
  return tr.steps.length > steps;
}
