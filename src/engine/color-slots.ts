// Colour slots: how many colours the people in a document are told apart by. The host sets one
// count for the editor (`colorSlots`), and the carets, the avatars, the authorship tints and the
// contributors pane all place people in that many slots, so a person has one colour everywhere.

import type { Command, EditorState } from 'prosemirror-state';
import { authorshipKey } from './authorship.js';
import { COLOR_SLOTS_META, colorSlotCount, PRESENCE_COLOR_SLOTS, presenceKey } from './presence.js';

/**
 * How many colour slots the editor places people in: the count `setColorSlots` set last, or
 * `PRESENCE_COLOR_SLOTS` while none was set.
 */
export function colorSlotsOf(state: EditorState): number {
  return (
    presenceKey.getState(state)?.slots ??
    authorshipKey.getState(state)?.slots ??
    PRESENCE_COLOR_SLOTS
  );
}

/**
 * Places people in `count` colour slots (a whole number of at least one; `PRESENCE_COLOR_SLOTS`
 * when not given or not one): presence and authorship place them again. Out of the history; false when every
 * installed plugin already uses that count, or neither is installed.
 */
export function setColorSlots(count: number | undefined): Command {
  return (state, dispatch) => {
    const slots = colorSlotCount(count);
    const counts = [presenceKey.getState(state)?.slots, authorshipKey.getState(state)?.slots];
    if (counts.every((each) => each === undefined || each === slots)) return false;
    dispatch?.(state.tr.setMeta(COLOR_SLOTS_META, slots).setMeta('addToHistory', false));
    return true;
  };
}
