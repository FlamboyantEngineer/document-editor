// A menu the writer opens by typing a trigger, such as `/` or `@`: the base library's completion
// list at the trigger, narrowed by the query typed after it, while focus stays in the document.
// The document's keys ask the open menu first: the arrows move through its options, Enter or Tab
// chooses one and Escape closes it until another trigger is typed.

import {
  CompletionList,
  type CompletionListItem,
  getCompletionOptionId,
} from '@flamboyantengineer/ui-components/completion-list';
import type { Key } from '@flamboyantengineer/ui-components/core';
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import {
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type TextTrigger, triggerAt, type TriggerMatch } from '../../engine/index.js';

/** The key handlers of the open menus, which the document's keys ask before its own. */
export type MenuKeys = Set<(event: KeyboardEvent) => boolean>;

/** Asks the open menus for a key the document took: true once one of them handled it. */
export function menuTakesKey(keys: MenuKeys, event: KeyboardEvent): boolean {
  if (event.isComposing) return false;
  for (const handle of keys) if (handle(event)) return true;
  return false;
}

/**
 * The trigger typed before the caret while the menu may open, and a way to close it: a closed
 * trigger stays closed while the writer types on after it, and the next one opens again.
 */
export function useTriggerMatch(state: EditorState, trigger: TextTrigger, isEnabled: boolean) {
  const [dismissed, setDismissed] = useState<number | null>(null);
  const match = isEnabled ? triggerAt(state, trigger) : null;
  if (!match && dismissed !== null) setDismissed(null);
  const open = match && match.from !== dismissed ? match : null;
  return { match: open, dismiss: () => setDismissed(match?.from ?? null) };
}

// The trigger's box in the viewport, which the list opens below.
function triggerRect(view: EditorView, from: number): DOMRect | null {
  if (view.isDestroyed) return null;
  try {
    const { left, top, bottom } = view.coordsAtPos(from, 1);
    return new DOMRect(left, top, 0, bottom - top);
  } catch {
    return null;
  }
}

// The option the arrows move to, from the first for each new query.
function useActiveIndex(match: TriggerMatch, count: number) {
  const key = `${String(match.from)}:${match.query}`;
  const [active, setActive] = useState({ key, index: 0 });
  if (active.key !== key) setActive({ key, index: 0 });
  const index = active.key === key && count > 0 ? Math.min(active.index, count - 1) : 0;
  return { index, setIndex: (next: number) => setActive({ key, index: next }) };
}

// While the list shows, the document names it and its active option for assistive technology.
function useListAttributes(view: EditorView, listId: string, activeId: string | null) {
  useEffect(() => {
    const { dom } = view;
    dom.setAttribute('aria-controls', listId);
    dom.setAttribute('aria-expanded', 'true');
    if (activeId) dom.setAttribute('aria-activedescendant', activeId);
    return () => {
      dom.removeAttribute('aria-controls');
      dom.removeAttribute('aria-expanded');
      dom.removeAttribute('aria-activedescendant');
    };
  }, [view, listId, activeId]);
}

/** What a typed menu shows and does. */
export interface TriggerMenuProps {
  view: EditorView;
  match: TriggerMatch;
  /** Closes the menu until another trigger is typed. */
  dismiss: () => void;
  items: readonly CompletionListItem[];
  menuKeys: MenuKeys;
  label: string;
  /** Shown while no option matches the query. */
  emptyState?: ReactNode;
  /** Chooses an option, for the trigger typed. */
  onChoose: (key: Key, match: TriggerMatch) => void;
  className?: string | undefined;
}

/** The completion list at a typed trigger, driven by the document's keys. */
export function TriggerMenu(props: TriggerMenuProps) {
  const { view, match, items, menuKeys } = props;
  const listId = useId();
  const { index, setIndex } = useActiveIndex(match, items.length);
  const shown = useRef(false);
  const active = items[index];
  useListAttributes(view, listId, active ? getCompletionOptionId(listId, active.id) : null);
  const anchor = useMemo(() => ({ current: view.dom }), [view]);
  // The keys act on the menu drawn last.
  const latest = useRef({ props, index, setIndex });
  useLayoutEffect(() => {
    latest.current = { props, index, setIndex };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { props: current, index: at, setIndex: move } = latest.current;
      const count = current.items.length;
      if (event.key === 'Escape') {
        current.dismiss();
        return true;
      }
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && count > 0) {
        move((at + (event.key === 'ArrowDown' ? 1 : count - 1)) % count);
        return true;
      }
      const chosen = current.items[at];
      if ((event.key === 'Enter' || event.key === 'Tab') && chosen && shown.current) {
        current.onChoose(chosen.id, current.match);
        return true;
      }
      return false;
    };
    menuKeys.add(onKey);
    return () => {
      menuKeys.delete(onKey);
    };
  }, [menuKeys]);
  return (
    <CompletionList
      id={listId}
      className={props.className}
      aria-label={props.label}
      isOpen
      onOpenChange={(open) => {
        if (!open) props.dismiss();
      }}
      onShownChange={(isShown) => {
        shown.current = isShown;
      }}
      anchorRef={anchor}
      getTargetRect={() => triggerRect(view, match.from)}
      items={items}
      activeKey={active?.id ?? null}
      onActiveKeyChange={(key) =>
        setIndex(
          Math.max(
            0,
            items.findIndex((item) => item.id === key),
          ),
        )
      }
      onAction={(key) => props.onChoose(key, match)}
      renderEmptyState={props.emptyState === undefined ? undefined : () => props.emptyState}
    />
  );
}
