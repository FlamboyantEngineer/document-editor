import type { Node } from 'prosemirror-model';
import { blockFormatOf, type BlockFormatRecord } from '../engine/suggested-formatting.js';
import { identityAttributesOf } from '../model/schema/element-attributes.js';
import type { GuardPermissions } from './guard-comments.js';

function formatting(node: Node): string {
  const identity = new Set(identityAttributesOf(node.type).map((attribute) => attribute.name));
  return JSON.stringify({
    type: node.type.name,
    attrs: Object.fromEntries(
      Object.entries(node.attrs).filter(
        ([name]) =>
          !identity.has(name) &&
          !['orphanedListContinuation', 'continuationPlaceholder'].includes(name),
      ),
    ),
  });
}

function recorded(node: Node, record: BlockFormatRecord): string | null {
  const type = node.type.schema.nodes[record.type];
  return type ? formatting(type.create(record.attrs)) : null;
}

function hasOwnNodeMarkers(node: Node, actor: string | null): boolean {
  if (
    node.attrs.suggestionSplitKind === 'insertion' &&
    (actor === null || node.attrs.dataAuthor !== actor)
  )
    return false;
  const format = blockFormatOf(node);
  return !format || (actor !== null && format.author === actor);
}

/** Suggested inserted blocks always retain their authenticated proposer. */
export function canInsertGuardNode(node: Node, actor: string | null): boolean {
  let own = hasOwnNodeMarkers(node, actor);
  node.descendants((child) => {
    if (!hasOwnNodeMarkers(child, actor)) own = false;
    return own;
  });
  return own;
}

function hasChangedInsertion(before: Node, after: Node): boolean {
  return (
    after.attrs.suggestionSplitKind === 'insertion' &&
    (before.attrs.suggestionSplitKind !== 'insertion' ||
      before.attrs.suggestionSplitId !== after.attrs.suggestionSplitId ||
      before.attrs.dataAuthor !== after.attrs.dataAuthor)
  );
}

function canProposeFormat(
  author: string | null,
  options: { actor: string | null; permissions: GuardPermissions },
): boolean {
  return (
    options.permissions.suggest &&
    (options.permissions.manageProposals === true || author === options.actor)
  );
}

function canChangeNodeMarkers(
  before: Node,
  after: Node,
  options: { actor: string | null; permissions: GuardPermissions },
): boolean {
  if (options.permissions.manageProposals) return true;
  if (hasChangedInsertion(before, after) && !hasOwnNodeMarkers(after, options.actor)) return false;
  const previous = blockFormatOf(before);
  const next = blockFormatOf(after);
  if (!next || JSON.stringify(previous) === JSON.stringify(next)) return true;
  return options.actor !== null && next.author === options.actor;
}

/** A decision restores or keeps recorded formatting without granting unrelated attribute edits. */
export function canChangeGuardAttributes(
  before: Node,
  after: Node,
  options: { actor: string | null; permissions: GuardPermissions },
): boolean {
  if (!canChangeNodeMarkers(before, after, options)) return false;
  if (options.permissions.edit || formatting(before) === formatting(after)) return true;
  const previous = blockFormatOf(before);
  const next = blockFormatOf(after);
  if (next && canProposeFormat(next.author, options)) {
    return previous
      ? recorded(before, previous) === recorded(after, next)
      : formatting(before) === recorded(after, next);
  }
  const mayWithdraw = options.permissions.suggest && previous?.author === options.actor;
  return (
    previous !== null &&
    next === null &&
    (options.permissions.decide || mayWithdraw) &&
    formatting(after) === recorded(before, previous)
  );
}
