import type { Node } from 'prosemirror-model';
import { listSuggestions } from '../engine/suggestion-decisions.js';
import type { GuardPermissions } from './guard-comments.js';
import { createGuardPositions } from './guard-positions.js';
import type { RoomScope } from './room-scope.js';

export interface GuardAnchor {
  readonly id: string;
  readonly author: string | null;
  readonly from: unknown;
  readonly to: unknown;
}

/** Anchors follow surrounding edits and decisions, while a deleted/reinserted proposal loses its place. */
export function captureGuardAnchors(
  scope: RoomScope,
  content: Node | null,
): readonly GuardAnchor[] {
  if (!content) return [];
  const suggestions = listSuggestions(content);
  if (!suggestions.length) return [];
  const positions = createGuardPositions(scope.content, content);
  return suggestions.map((suggestion) => ({
    id: suggestion.id,
    author: suggestion.author,
    from: positions.toRelativeJSON(suggestion.from),
    to: positions.toRelativeJSON(suggestion.to),
  }));
}

/** Remaining foreign proposals cannot be relocated or repurposed through another capability. */
export function hasGuardAnchors(
  anchors: readonly GuardAnchor[],
  content: Node | null,
  options: { scope: RoomScope; actor: string | null; permissions: GuardPermissions },
): boolean {
  if (!content || !anchors.length || options.permissions.manageProposals) return true;
  const positions = createGuardPositions(options.scope.content, content);
  const remaining = new Map(
    listSuggestions(content).map((suggestion) => [suggestion.id, suggestion]),
  );
  return anchors.every((anchor) => {
    if (options.actor !== null && anchor.author === options.actor && options.permissions.suggest)
      return true;
    const suggestion = remaining.get(anchor.id);
    if (!suggestion) return true;
    return (
      positions.fromRelativeJSON(anchor.from) === suggestion.from &&
      positions.fromRelativeJSON(anchor.to) === suggestion.to
    );
  });
}
