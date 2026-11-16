// Commands on the list of contents at the selection: the deepest heading level it shows, and the
// groups of entries it shows.

import type { Command } from 'prosemirror-state';
import { nodeAtSelection } from './object-commands.js';

/** Sets the deepest heading level the list of contents selected shows. */
export function setContentsDepth(depth: number): Command {
  return (state, dispatch) => {
    const found = nodeAtSelection(state, ['toc_block']);
    if (!found || depth < 1 || depth > 6) return false;
    dispatch?.(
      state.tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, minLevel: depth }),
    );
    return true;
  };
}

/**
 * Sets the groups the selected list of contents shows, such as the kinds of document a list of
 * references lists; every group for none or for all of `every`.
 */
export function setContentsGroups(groups: readonly string[], every: readonly string[]): Command {
  return (state, dispatch) => {
    const found = nodeAtSelection(state, ['toc_block']);
    if (!found) return false;
    const all = every.every((group) => groups.includes(group));
    const refFilter = groups.length === 0 || all ? null : groups.join(',');
    dispatch?.(state.tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, refFilter }));
    return true;
  };
}
