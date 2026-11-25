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

interface AnchorCheck {
  scope: RoomScope;
  actor: string | null;
  permissions: GuardPermissions;
  /** The content before the change, for a reading fitted to the schema (DOCE-COLLAB-7.4). */
  before: Node | null;
  /**
   * Whether the content is the reading fitted to the schema of a change the exact replay refused,
   * whose structure is not the shared content's. An exact reading whose positions cannot be built
   * throws, and the change is refused.
   */
  fitted: boolean;
}

const textOf = (content: Node, { from, to }: { from: number; to: number }) =>
  content.textBetween(from, to, '\n', '\ufffc');

/** Remaining foreign proposals cannot be relocated or repurposed through another capability. */
export function hasGuardAnchors(
  anchors: readonly GuardAnchor[],
  content: Node | null,
  options: AnchorCheck,
): boolean {
  if (!content || !anchors.length || options.permissions.manageProposals) return true;
  const positions = options.fitted ? null : createGuardPositions(options.scope.content, content);
  const remaining = new Map(
    listSuggestions(content).map((suggestion) => [suggestion.id, suggestion]),
  );
  // A fitted reading has no shared positions: each remaining foreign proposal keeps its text.
  const held = new Map(
    (options.before ? listSuggestions(options.before) : []).map((each) => [each.id, each]),
  );
  return anchors.every((anchor) => {
    if (options.actor !== null && anchor.author === options.actor && options.permissions.suggest)
      return true;
    const suggestion = remaining.get(anchor.id);
    if (!suggestion) return true;
    if (!positions) {
      const before = held.get(anchor.id);
      return (
        !!before &&
        !!options.before &&
        before.author === suggestion.author &&
        textOf(options.before, before) === textOf(content, suggestion)
      );
    }
    return (
      positions.fromRelativeJSON(anchor.from) === suggestion.from &&
      positions.fromRelativeJSON(anchor.to) === suggestion.to
    );
  });
}
