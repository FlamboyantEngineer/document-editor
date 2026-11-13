// Keyboard choice of a list of contents' entries (DOCE-CONTENTS-2.4): one entry of a list is in the
// tab order, the arrow keys, Home and End move the focus between them, and Enter or Space chooses one.

const ENTRY_MOVES: Readonly<Record<string, (entries: number, at: number) => number>> = {
  ArrowDown: (entries, at) => Math.min(entries - 1, at + 1),
  ArrowUp: (_entries, at) => Math.max(0, at - 1),
  Home: () => 0,
  End: (entries) => entries - 1,
};

/**
 * Enter or Space chooses an entry; the arrow keys, Home and End move the focus between a list's
 * entries, keeping the one focused in the tab order.
 */
function onEntryKey(event: KeyboardEvent, row: HTMLElement, choose: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    choose();
    return;
  }
  const move = ENTRY_MOVES[event.key];
  const list = row.parentElement;
  if (!move || !list) return;
  event.preventDefault();
  const entries = [...list.querySelectorAll<HTMLElement>(':scope > .de-contents__entry')];
  const next = entries[move(entries.length, entries.indexOf(row))];
  if (!next) return;
  for (const entry of entries) entry.tabIndex = entry === next ? 0 : -1;
  next.focus();
}

/** Makes an entry choosable with a click or the keys; the first entry of a list is in the tab order. */
export function chooseEntryWith(row: HTMLElement, first: boolean, choose: () => void) {
  row.tabIndex = first ? 0 : -1;
  row.addEventListener('click', choose);
  row.addEventListener('keydown', (event) => onEntryKey(event, row, choose));
}
