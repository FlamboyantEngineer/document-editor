import type { Node } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { decideSuggestions, listSuggestions } from '../engine/suggestion-decisions.js';
import { canChangeGuardAttributes, canInsertGuardNode } from './guard-attributes.js';
import type { GuardPermissions } from './guard-comments.js';
import {
  citedFootnotes,
  hasFootnoteNumbering,
  settleRejectedFootnotes,
} from './guard-footnotes.js';
import { canChangeGuardMarks } from './guard-marks.js';
import { readGuardProposals } from './guard-proposals.js';
import { readContentChange } from './room-change-walk.js';

interface ContentGuardOptions {
  before: Node;
  after: Node;
  actor: string | null;
  permissions: GuardPermissions;
}

function original(node: Node, actor?: string | null): Node {
  const tr = EditorState.create({ doc: node }).tr;
  const ids =
    actor === undefined
      ? undefined
      : new Set(
          listSuggestions(node)
            .filter((suggestion) => actor !== null && suggestion.author === actor)
            .map((suggestion) => suggestion.id),
        );
  const cited = citedFootnotes(tr);
  decideSuggestions(tr, 'reject', { ids });
  settleRejectedFootnotes(tr, cited);
  const highlight = node.type.schema.marks.comment_highlight;
  if (highlight) tr.removeMark(0, tr.doc.content.size, highlight);
  return tr.doc;
}

function canChangeProposals({ before, after, actor, permissions }: ContentGuardOptions): boolean {
  const previous = readGuardProposals(before);
  const next = readGuardProposals(after);
  const changed = next.list.filter(
    (suggestion) => !previous.signatures.has(next.byId.get(suggestion.id)?.signature ?? ''),
  );
  for (const suggestion of previous.list) {
    if (actor !== null && suggestion.author === actor) continue;
    const candidate = next.byId.get(suggestion.id);
    if (
      candidate
        ? !permissions.manageProposals &&
          candidate.signature !== previous.byId.get(suggestion.id)?.signature
        : !permissions.decide
    )
      return false;
  }
  if (
    changed.some(
      (suggestion) =>
        !permissions.manageProposals && (actor === null || suggestion.author !== actor),
    )
  )
    return false;
  if (
    !permissions.decide &&
    previous.list.some((suggestion) => !next.byId.has(suggestion.id)) &&
    !original(before).eq(original(after))
  )
    return false;
  if (!permissions.suggest && changed.length > 0) return false;
  return true;
}

/** Structural permission checks independent of update encoding and transaction origins. */
export function checkDocumentChange({
  before,
  after,
  actor,
  permissions,
}: ContentGuardOptions): boolean {
  if (before.eq(after)) return true;
  // A writer who may edit may set any footnote number; anyone else only one numbering gives.
  let marksAllowed = permissions.edit || hasFootnoteNumbering(before, after);
  const change = readContentChange(before, after, {
    marks: (a, b) => {
      if (!canChangeGuardMarks(a, b, { actor, permissions })) marksAllowed = false;
    },
    nodes: (a, b) => {
      if (!canChangeGuardAttributes(a, b, { actor, permissions })) marksAllowed = false;
    },
    inserted: (node) => {
      if (!permissions.manageProposals && !canInsertGuardNode(node, actor)) marksAllowed = false;
    },
  });
  if (!marksAllowed) return false;
  if (change.needs.has('comment') && !permissions.comment) return false;
  if (!canChangeProposals({ before, after, actor, permissions })) return false;
  if (change.proposed.size > 0 && !permissions.suggest) return false;
  if (permissions.edit) return true;
  if (!permissions.suggest && !permissions.decide) return false;
  if (change.needs.has('edit')) return false;
  if (permissions.decide) return true;
  const author = permissions.manageProposals ? undefined : actor;
  return original(before, author).eq(original(after, author));
}
