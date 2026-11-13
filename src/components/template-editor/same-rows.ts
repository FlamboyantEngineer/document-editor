// Whether rows show what they showed, so a card of a template's several hundred settings renders
// again only when what it shows changes.

import type { Rows } from './template-rows.js';

/** What a card of rows shows: the rows' context, and the target's settings at the card. */
export interface ShownRows {
  readonly context: Rows;
  /** The target's own settings at the card. */
  readonly own: unknown;
  /** The settings the target inherits at the card. */
  readonly inherited: unknown;
}

/**
 * Whether rows show what they showed: the same own settings, equal inherited ones (a resolved
 * template is built again on each change), from the same source and with the same host props.
 * Their handlers write through a target that stays the same (`SettingSections`).
 */
export function isSameRows(before: ShownRows, after: ShownRows): boolean {
  const [was, is] = [before.context, after.context];
  return (
    before.own === after.own &&
    JSON.stringify(before.inherited) === JSON.stringify(after.inherited) &&
    was.target.source === is.target.source &&
    was.props.labels === is.props.labels &&
    was.props.isDisabled === is.props.isDisabled &&
    was.props.fonts === is.props.fonts &&
    was.props.codeFonts === is.props.codeFonts
  );
}
