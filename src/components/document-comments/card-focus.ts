// Keyboard focus as a card leaves its list. A thread that is resolved or deleted and a suggestion
// that is decided take their card away, and focus inside a removed element falls to the page's
// body: a reader working by keyboard would travel back to the cards for each of the next ones.

import { type RefObject, useLayoutEffect } from 'react';
import { getComposedActiveElement } from '../../utils/composed-focus.js';

const listOf = (item: Element) => item.parentElement?.closest<HTMLElement>('[role="list"]') ?? null;

// What takes focus in a list item: the item when it can, as a card does, else the first control in
// it, as the marker of a card shown by markers.
function focusTargetOf(item: HTMLElement): HTMLElement | null {
  return item.hasAttribute('tabindex')
    ? item
    : item.querySelector<HTMLElement>('button, [tabindex]');
}

// What takes the focus of a card about to leave its list: the card after it, else the one before,
// else the list when it can take focus.
function successorOf(card: Element): HTMLElement | null {
  const item = card.closest<HTMLElement>('[role="listitem"]');
  const list = item && listOf(item);
  if (!item || !list) return null;
  // A card's comments may be a list of their own, whose items are not cards.
  const items = [...list.querySelectorAll<HTMLElement>('[role="listitem"]')].filter(
    (each) => listOf(each) === list,
  );
  const at = items.indexOf(item);
  const neighbour = items[at + 1] ?? items[at - 1];
  if (neighbour) return focusTargetOf(neighbour);
  return list.hasAttribute('tabindex') ? list : null;
}

/**
 * Hands keyboard focus on when the card holding it leaves its list: to the card after it, else the
 * one before, else the list itself when it can take focus, so the reader goes on from where they
 * were. `cardRef` is the card's element, in a list item of a list (`role`).
 */
export function useFocusHandOver(cardRef: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const card = cardRef.current;
    return () => {
      // The card is still in the document here, with the focus it is about to lose.
      if (!card?.contains(getComposedActiveElement(card.ownerDocument))) return;
      const successor = successorOf(card);
      // Focus moves once the cards are committed, when the one that takes it hears of it.
      queueMicrotask(() => {
        if (successor?.isConnected) successor.focus();
      });
    };
  }, [cardRef]);
}
