// Which cards of the comments margin are open in the markers presentation, where each thread and
// suggestion is a marker beside its text: none when the document loads, and a card opens only when
// the reader asks for it: its marker, a click on its text, the comments panel or a link
// (`openThread`), or starting a thread, whose composer always shows. Opening a card from its text
// or a link focuses the card; clicking the text of a card already open focuses its reply box.

import type { Key } from '@flamboyantengineer/ui-components/core';
import type { Command } from 'prosemirror-state';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { isElement } from '../../utils/is-element.js';
import type { OpenedComment } from './comment-focus.js';
import type { CommentItem } from './comment-items.js';
import { useCommentPointer } from './comment-pointer-controls.js';
import type { ClickedAnchor } from './document-pointer.js';

/** The element id of a margin card, by its item's key. */
export const cardElementId = (key: string) => `de-comment-card-${key}`;

/** The key of the card a click on its text opens, among the items the margin shows. */
function itemKeyOf(anchor: ClickedAnchor, items: readonly CommentItem[]): string | null {
  const found = items.find((item) => {
    if (anchor.kind === 'comment') return item.key === `comment:${anchor.id}`;
    if (item.kind !== 'suggestion') return false;
    const { suggestion } = item;
    return (
      suggestion.id === anchor.id || (anchor.thread !== null && suggestion.thread === anchor.thread)
    );
  });
  return found?.key ?? null;
}

/** What a card that opens takes focus to: the card, or its reply box. */
type FocusTarget = 'card' | 'reply';

// The text box of a card's reply composer, while it shows.
function replyBoxOf(card: HTMLElement): HTMLElement | null {
  const box = card.querySelector<HTMLElement>(
    '.ui-comment-composer textarea, .ui-comment-composer [role="textbox"]',
  );
  return box?.closest('[hidden]') ? null : box;
}

/** Focuses a card, or its reply box when it has one showing, and says whether it could. */
export function focusCard(card: HTMLElement | null, target: FocusTarget): boolean {
  if (!card) return false;
  const reply = target === 'reply' ? replyBoxOf(card) : null;
  (reply ?? card).focus({ preventScroll: true });
  return true;
}

// The controls inside a card that take a press themselves, rather than focusing its reply box.
const CONTROLS =
  'button, a[href], input, textarea, select, [role="textbox"], [role="menu"], [role="menuitem"], [contenteditable]';

/**
 * Focuses a card's reply box when the reader presses the card itself, not one of its controls, as
 * selecting a thread to answer it; a thread without a composer showing keeps focus where it was.
 */
export function focusReplyOnPress(event: { target: EventTarget; currentTarget: HTMLElement }) {
  if (isControlPress(event.target)) return;
  replyBoxOf(event.currentTarget)?.focus();
}

/** Whether a press landed on one of a card's controls, which take it themselves. */
export function isControlPress(target: EventTarget): boolean {
  const pressed = isElement(target) ? target : null;
  return !pressed || pressed.closest(CONTROLS) !== null;
}

interface OpenCardsOptions {
  readonly items: readonly CommentItem[];
  /** Whether the margin shows markers, whose cards open on request. */
  readonly markers: boolean;
  readonly layer: HTMLElement | null;
  /** Starts a thread on the selection, which the offer's marker does. */
  readonly startThread: () => void;
}

/** The margin's open cards, how they change, and how to open one. */
function useOpenCards({ items, markers, layer, startThread }: OpenCardsOptions) {
  const [open, setOpen] = useState<ReadonlySet<Key>>(() => new Set());
  // The card to focus once drawn; a new request draws the margin again to take it.
  const focusing = useRef<{ key: string; target: FocusTarget } | null>(null);
  const [, setRequests] = useState(0);
  // A thread being started always shows its composer.
  const openKeys = useMemo(() => {
    const keys = new Set(open);
    for (const item of items) if (item.kind === 'pending') keys.add(item.key);
    return keys;
  }, [open, items]);
  const onOpenChange = (keys: Set<Key>) => {
    // The offer's marker starts the thread at once rather than opening a card with a button.
    if (keys.has('draft')) {
      keys.delete('draft');
      startThread();
    }
    setOpen(keys);
  };
  /** Focuses a card, or its reply box, once it is drawn. */
  const focusOn = (key: string, target: FocusTarget) => {
    focusing.current = { key, target };
    setRequests((count) => count + 1);
  };
  /** Opens a card, focusing it, or its reply box once it was open already. */
  const openCard = (key: string, focus: 'open' | 'reply') => {
    if (!markers) return;
    const wasOpen = openKeys.has(key);
    if (!wasOpen) setOpen((current) => new Set(current).add(key));
    focusOn(key, wasOpen && focus === 'reply' ? 'reply' : 'card');
  };
  // The card takes focus once it is drawn.
  useLayoutEffect(() => {
    const request = focusing.current;
    if (!request || !layer) return;
    const card = layer.ownerDocument.getElementById(cardElementId(request.key));
    if (focusCard(card, request.target)) focusing.current = null;
  });
  return { openKeys, onOpenChange, openCard, focusOn };
}

/** What the margin opens cards on: its items, its layer and the ways to the threads. */
interface MarginOpening {
  readonly items: readonly CommentItem[];
  readonly layer: HTMLElement | null;
  readonly opened: OpenedComment | null;
  readonly run: (command: Command) => void;
  readonly startThread: () => void;
  readonly setActive: (key: Key) => void;
}

/**
 * The margin's open cards in the markers presentation (the default): a thread or a suggestion the
 * reader is taken to opens, active and focused, and a click on a thread's or a suggestion's text
 * opens its card, or, open already, focuses its reply box.
 */
export function useMarginOpening(
  props: { readonly presentation?: 'cards' | 'markers' | undefined } & Parameters<
    typeof useCommentPointer
  >[0],
  { items, layer, opened, run, startThread, setActive }: MarginOpening,
) {
  const markers = (props.presentation ?? 'markers') === 'markers';
  const cards = useOpenCards({ items, markers, layer, startThread });
  const [lastOpened, setLastOpened] = useState(opened);
  if (opened !== lastOpened) {
    setLastOpened(opened);
    if (opened) {
      setActive(opened.key);
      cards.openCard(opened.key, opened.focus ?? 'open');
    }
  }
  useCommentPointer(props, {
    run,
    open: (anchor) => {
      const key = itemKeyOf(anchor, items);
      if (key === null) return;
      setActive(key);
      cards.openCard(key, 'reply');
    },
  });
  return { markers, ...cards };
}
