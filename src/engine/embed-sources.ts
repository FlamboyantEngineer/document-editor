// Which changes may change the embeds a status asks the host about: those that add, remove or
// change an embed's source or state, never those inside an embed's content or away from embeds.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import { AddMarkStep, AttrStep, RemoveMarkStep } from 'prosemirror-transform';
import { isAnyEmbed } from './embeds.js';

/**
 * Whether a change may add, remove or change an embed's kind, source or state: a step that
 * replaces a range holding an embed or puts one in, or sets an embed's attributes. A change inside
 * an embed's content, or anywhere away from embeds, such as typing in a paragraph, does not, so it
 * moves the marks and asks the host nothing, and the document is not walked.
 */
export function touchesEmbedSources(tr: Transaction): boolean {
  return tr.steps.some((step, index) => {
    const before = tr.docs[index];
    const after = tr.docs[index + 1] ?? tr.doc;
    if (!before) return true;
    if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) return false;
    if (step instanceof AttrStep) {
      const node = before.nodeAt(step.pos);
      return !node || isAnyEmbed(node);
    }
    let touched = false;
    step.getMap().forEach((...[oldStart, oldEnd, newStart, newEnd]) => {
      touched ||= holdsEmbed(before, oldStart, oldEnd) || holdsEmbed(after, newStart, newEnd);
    });
    // A step that maps no range, such as one on a node's marks, changes no embed.
    return touched;
  });
}

// Whether a range holds an embed, whole or in part, other than one it lies inside of.
function holdsEmbed(doc: ProseMirrorNode, from: number, to: number): boolean {
  if (from >= to) return false;
  let found = false;
  doc.nodesBetween(from, to, (node, pos) => {
    // An embed the range lies inside of keeps its source: only its content changes.
    const inside = pos < from && pos + node.nodeSize > to;
    found ||= isAnyEmbed(node) && !inside;
    return !found;
  });
  return found;
}
