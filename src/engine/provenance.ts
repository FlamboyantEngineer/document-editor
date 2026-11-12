// Who wrote each run of text: every local insert carries its writer's contributor mark, for a
// person or an automated session. The contributor mark is inclusive, so text typed right after
// another writer's would take theirs; each insert is marked again as its own writer's, or left
// unmarked when the editor knows no writer, so an agent's attribution never bleeds into a person's
// typing.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import { isStructureNode } from '../model/schema/document-structure.js';
import { automationActor } from './automation.js';
import { isInPageRegion } from './block-place.js';
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

// The part of the document a replace step made new, after the step, found by comparing the
// documents around it: a change that rewrites a whole node or page to type one character, as an
// editor reading the DOM or a view following another may make, inserts only that character.
function newPart(before: ProseMirrorNode, after: ProseMirrorNode): Inserted | null {
  const start = before.content.findDiffStart(after.content);
  if (start === null) return null;
  const end = after.content.findDiffEnd(before.content);
  let to = end?.a ?? after.content.size;
  const overlap = start - Math.min(to, end?.b ?? before.content.size);
  if (overlap > 0) to += overlap;
  return to > start ? { from: start, to } : null;
}

// Whether a step lays pages out rather than inserting the writer's content: a view following
// another document, as the measuring view does, replaces whole pages.
function laysOut(step: ReplaceStep): boolean {
  let pages = false;
  step.slice.content.descendants((node) => {
    pages ||= isStructureNode(node);
    return !pages && !node.isTextblock;
  });
  return pages;
}

// The ranges each of the writer's own changes inserted, in the document after every change.
function insertedRanges(transactions: readonly Transaction[], own: (tr: Transaction) => boolean) {
  const ranges: Inserted[] = [];
  transactions.forEach((tr, index) => {
    if (!own(tr)) return;
    const later = transactions.slice(index + 1);
    tr.steps.forEach((step, stepIndex) => {
      if (!(step instanceof ReplaceStep) || step.slice.size === 0 || laysOut(step)) return;
      const before = tr.docs[stepIndex];
      const part = before && newPart(before, tr.docs[stepIndex + 1] ?? tr.doc);
      if (!part) return;
      const rest = tr.mapping.slice(stepIndex + 1);
      let from = rest.map(part.from, 1);
      let to = rest.map(part.to, -1);
      for (const next of later) {
        from = next.mapping.map(from, 1);
        to = next.mapping.map(to, -1);
      }
      if (to > from) ranges.push({ from, to });
    });
  });
  return ranges;
}

// Who a run of text reads as written by: its contributor mark's writer, else its block's writer,
// as authorship reads it (DOCE-COLLAB-3.1); null when neither says.
function writtenBy(node: ProseMirrorNode, block: ProseMirrorNode | null): Contributor | null {
  const mark = node.marks.find((each) => each.type.name === 'contributor');
  if (!mark) return blockWriter(block);
  const author: unknown = mark.attrs.dataAuthor;
  if (typeof author !== 'string' || !author) return null;
  return { author, aiSession: (mark.attrs.dataAiSession as string | null | undefined) ?? null };
}

// The writer of a block, which its unmarked text reads as.
function blockWriter(block: ProseMirrorNode | null): Contributor | null {
  const author: unknown = block?.attrs.dataAuthor;
  return typeof author === 'string' && author ? { author } : null;
}

const sameWriter = (a: Contributor | null, b: Contributor | null) =>
  a?.author === b?.author && (a?.aiSession ?? null) === (b?.aiSession ?? null);

// The marks whose text is generated, not written: a reference's text is its target's.
const GENERATED = new Set(['reference']);

/** A run of inserted text and the block holding it. */
interface Run extends Inserted {
  readonly block: Contributor | null;
}

// The runs of written text in a range that read as another known writer's.
function misattributed(tr: Transaction, range: Inserted, writer: Contributor | null): Run[] {
  const runs: Run[] = [];
  tr.doc.nodesBetween(range.from, range.to, (node, pos, parent) => {
    if (!node.isText) return true;
    if (node.marks.some((mark) => GENERATED.has(mark.type.name))) return false;
    const by = writtenBy(node, parent);
    if (!by || sameWriter(by, writer)) return false;
    const from = Math.max(pos, range.from);
    const to = Math.min(pos + node.nodeSize, range.to);
    runs.push({ from, to, block: blockWriter(parent) });
    return false;
  });
  return runs;
}

// Makes the runs of a range that read as another known writer's, as the text after an agent's takes
// its mark, read as the writer's: the foreign mark is removed, and the writer's added unless the
// block is the writer's.
function markRange(tr: Transaction, range: Inserted, writer: Contributor | null): void {
  const type = tr.doc.type.schema.marks.contributor;
  if (!type) return;
  for (const run of misattributed(tr, range, writer)) {
    tr.removeMark(run.from, run.to, type);
    if (writer && !sameWriter(run.block, writer)) {
      const attrs = { dataAuthor: writer.author, dataAiSession: writer.aiSession ?? null };
      tr.addMark(run.from, run.to, type.create(attrs));
    }
  }
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
  if (!tr.doc.type.schema.marks.contributor) return false;
  const own = (each: Transaction) =>
    isLocalEdit(each, isRemote) && each.getMeta('addToHistory') !== false && !automationActor(each);
  const ranges = insertedRanges(transactions, own);
  if (!ranges.length) return false;
  const writer = contributor();
  const steps = tr.steps.length;
  for (const range of ranges) {
    // A page region's text is the template's, not the document's.
    if (isInPageRegion(tr.doc.resolve(range.from))) continue;
    markRange(tr, range, writer);
  }
  return tr.steps.length > steps;
}
