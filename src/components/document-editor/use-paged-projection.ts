// DocumentEditor on a paged projection (PG-40). The host's state is the canonical state: the whole
// document, each section on one page with whole blocks, which takes every edit and the undo
// history. The engine renders a projection of it on pages (`createPagedProjection`), and the
// toolbar, menus and dialogs act on the engine's view as a view of the canonical state
// (`canonicalView`). Input on the pages becomes canonical transactions, which pass through the
// editor's dispatch body (suggestions, proofing) to the host; each state the host commits is shown
// on the pages again.

import type {
  RichTextEngineCommit,
  RichTextEngineEvents,
} from '@flamboyantengineer/ui-components/rich-text-editor';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { type RefObject, useEffect, useMemo, useRef } from 'react';
import type { CanonicalChange, PagedProjection } from '../../pagination/index.js';
import type { EngineViewEvents } from './use-editor-engine.js';

/** A projection the editor renders, with the projection state it renders now. */
export interface PagedEditor {
  readonly projection: PagedProjection;
  readonly state: EditorState;
}

type DispatchBody = NonNullable<RichTextEngineEvents['dispatchTransaction']>;
type EngineEvents = Omit<RichTextEngineEvents, 'props'>;

/** The engine's dispatch body for the projection: every transaction goes to the projection. */
export function projectionDispatch(projection: PagedProjection): DispatchBody {
  return (tr, _view, commit) => {
    projection.receive(tr);
    commit.applyState(projection.projection);
  };
}

/** What a canonical transaction from the pages passes through before the host commits it. */
export interface CanonicalCommit {
  /** The editor's dispatch body (suggestions, proofing), as the engine would run it. */
  readonly body: DispatchBody;
  readonly onStateChange: (update: (state: EditorState) => EditorState) => void;
  /** The engine's events, told of each canonical transaction as the engine tells of its own. */
  readonly events: EngineEvents;
}

// A commit that applies to the host's latest state; a transaction made on a state the host no
// longer holds, as after a suggestion rewrote one before it, is dropped and the pages drawn again.
// Taken as the projection applied it to the state the host still holds, it is that state the
// projection made, so what the plugins appended, such as new element ids, is the same on both
// (DOCE-PAGINATION-7.19).
function hostCommit(
  tr: Transaction,
  {
    onStateChange,
    resync,
    made,
  }: {
    onStateChange: CanonicalCommit['onStateChange'];
    resync(): void;
    made: CanonicalChange | null;
  },
): RichTextEngineCommit & { readonly committed: () => boolean } {
  let committed = false;
  const apply = (next: Transaction) =>
    onStateChange((state) => {
      if (made && next === tr && state === made.from) return made.to;
      if (next.before.eq(state.doc)) return state.apply(next);
      queueMicrotask(resync);
      return state;
    });
  return {
    applyDefault(override) {
      committed = true;
      apply(override ?? tr);
    },
    applyState(next) {
      committed = true;
      onStateChange(() => next);
    },
    committed: () => committed,
  };
}

// The canonical view as a transaction's body sees it: on the host's state, which the transaction
// was made on, as the engine's view holds the state before its own transactions.
function onHostState(view: EditorView, host: EditorState): EditorView {
  return new Proxy(view, {
    get: (target, key) => (key === 'state' ? host : Reflect.get(target, key)),
  });
}

// Where canonical transactions go and what they are shown with: the projection, the host's
// latest state, and the engine's view as a view of the canonical state.
interface PagedTarget {
  readonly projection: PagedProjection | null;
  readonly host: EditorState;
  readonly view: EditorView | null;
}

/**
 * The engine's events for the projection, from the editor's stable ones (`useEngineView`): the
 * view the engine mounts is attached to the
 * projection, and the host's events see the canonical view and state. Transactions are told of as
 * the canonical state takes them (`usePagedEditor`), not as the projection does.
 */
export function useProjectionEvents(
  projection: PagedProjection | null,
  events: EngineViewEvents,
): EngineEvents {
  const wrapped = useMemo<EngineEvents | null>(() => {
    if (!projection) return null;
    let detach: (() => void) | null = null;
    let previous = projection.state;
    const canonical = (view: EditorView) => projection.canonicalView(view);
    return {
      onMounted(view) {
        detach = projection.attach(view);
        events.onMounted(view, canonical(view));
      },
      onUnmounted() {
        detach?.();
        detach = null;
        events.onUnmounted?.();
      },
      onSelectionChange: (_selection, view) =>
        events.onSelectionChange?.(projection.state.selection, canonical(view)),
      onUpdated(view) {
        const before = previous;
        previous = projection.state;
        if (before !== previous) events.onUpdated?.(canonical(view), before);
      },
      afterCommit: (view) => events.afterCommit?.(canonical(view)),
    };
  }, [projection, events]);
  return wrapped ?? events;
}

/** What DocumentEditor gives its projection. */
export interface PagedEditorOptions extends CanonicalCommit {
  readonly state: EditorState;
}

/**
 * DocumentEditor's side of the projection: where the canonical transactions input on the pages
 * makes go (`onCanonical`), through the editor's dispatch body to the host, a transaction the body
 * drops taken back off the pages; and where the projection's layouts are told (`onLayout`).
 * `usePagedView` connects it to the projection and the engine's view.
 */
export function usePagedEditor(options: PagedEditorOptions) {
  const latestRef = useRef(options);
  const targetRef = useRef<PagedTarget>({ projection: null, host: options.state, view: null });
  useEffect(() => {
    latestRef.current = options;
  });
  return useMemo(() => {
    const resync = () => {
      const { projection, host } = targetRef.current;
      projection?.update(host);
    };
    return {
      targetRef,
      onCanonical(tr: Transaction, made: CanonicalChange | null = null) {
        const { view, host: held } = targetRef.current;
        if (!view) return;
        const { body, onStateChange, events } = latestRef.current;
        events.onTransaction?.(tr, view);
        const host = hostCommit(tr, { onStateChange, resync, made });
        body(tr, held.doc === tr.before ? onHostState(view, held) : view, host);
        if (!host.committed()) resync();
      },
      onLayout(tr: Transaction) {
        const { view } = targetRef.current;
        if (view) latestRef.current.events.onTransaction?.(tr, view);
      },
    };
  }, []);
}

/**
 * The engine's view as the editor's chrome sees it: the canonical view while the pages are a
 * projection, which then shows each state the host commits, by the difference from the one it
 * shows (DOCE-PAGINATION-7.12).
 */
export function usePagedView(
  paged: PagedEditor | null,
  view: EditorView | null,
  { state, targetRef }: { state: EditorState; targetRef: RefObject<PagedTarget> },
): EditorView | null {
  const projection = paged?.projection ?? null;
  const chrome = useMemo(
    () => (projection && view ? projection.canonicalView(view) : view),
    [projection, view],
  );
  useEffect(() => {
    targetRef.current = { projection, host: state, view: projection ? chrome : null };
  });
  useEffect(() => {
    projection?.update(state);
  }, [projection, state]);
  return chrome;
}

type ViewProps = NonNullable<RichTextEngineEvents['props']>;

/**
 * The editor's own view props over a projection: their handlers see the canonical view, so the
 * host's keys, pasted figures and focus act on the canonical state.
 */
export function canonicalViewProps(
  props: ViewProps,
  projection: PagedProjection | null,
): ViewProps {
  if (!projection) return props;
  const canonical = (view: EditorView) => projection.canonicalView(view);
  const { handleKeyDown, handlePaste, handleDrop, handleDOMEvents } = props;
  return {
    ...props,
    ...(handleKeyDown && { handleKeyDown: (view, event) => handleKeyDown(canonical(view), event) }),
    ...(handlePaste && {
      handlePaste: (view, event, slice) => handlePaste(canonical(view), event, slice),
    }),
    ...(handleDrop && {
      handleDrop: (view, ...rest) => handleDrop(canonical(view), ...rest),
    }),
    ...(handleDOMEvents && {
      handleDOMEvents: Object.fromEntries(
        Object.entries(handleDOMEvents).map(([name, handler]) => [
          name,
          (view: EditorView, event: Event) =>
            (handler as (view: EditorView, event: Event) => boolean | undefined)(
              canonical(view),
              event,
            ),
        ]),
      ),
    }),
  };
}
