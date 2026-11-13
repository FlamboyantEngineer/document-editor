// The pages in a plain ProseMirror view (DOCE-EDITOR-1.8): in page layout the editor draws the
// projection's pages with prosemirror-view, not React, so a keystroke redraws the blocks it changed
// and nothing else. React draws only the host's node views, through portals. The view tells the
// engine's events as the engine host does: once mounted, after each state it shows, and, for a
// state its own transaction made, the selection and the update.

import type { RichTextEngineEvents } from '@flamboyantengineer/ui-components/rich-text-editor';
import type { EditorState, Transaction } from 'prosemirror-state';
import { type DirectEditorProps, EditorView } from 'prosemirror-view';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { readDomSelection } from '../../utils/dom-selection.js';
import { type HostNodeViews, useHostNodeViews } from './host-node-views.js';
import { insertTypedText } from './typed-text.js';
import type { PagedEditor } from './use-paged-projection.js';

type EngineEvents = Omit<RichTextEngineEvents, 'props' | 'dispatchTransaction'>;
type ViewProps = NonNullable<RichTextEngineEvents['props']>;

/** What the pages view draws and tells. */
export interface PagesViewProps {
  /** The projection and the state of it to show. */
  readonly paged: PagedEditor;
  /** The engine's events, for the projection (`useProjectionEvents`). */
  readonly events: EngineEvents;
  /** The editor's view props, their handlers on the canonical view (`canonicalViewProps`). */
  readonly viewProps: ViewProps;
  /** The attributes of the document element: its hook classes, role and labels. */
  readonly attributes: Readonly<Record<string, string>>;
  /** The host's React node views. */
  readonly nodeViews?: HostNodeViews | undefined;
}

// How the view's own props reach the pages: the dispatch that sends every transaction to the
// projection, and what brings the view up to the projection's latest state before input acts.
interface ViewTies {
  readonly dispatch: (this: EditorView, tr: Transaction) => void;
  readonly catchUp: (view: EditorView) => void;
}

// The view's props: the editor's, the document element's attributes over theirs, the host's node
// views, and the ties to the projection. Typed text, which the view inserts itself, acts on the
// projection's latest state, which the host may have moved, as by rewriting the text before into a
// suggestion, before React draws it.
function directProps(
  { viewProps, attributes }: Pick<PagesViewProps, 'viewProps' | 'attributes'>,
  nodeViews: DirectEditorProps['nodeViews'],
  { dispatch, catchUp }: ViewTies,
): Omit<DirectEditorProps, 'state'> {
  const own = typeof viewProps.attributes === 'object' ? viewProps.attributes : {};
  const handlers = viewProps.handleDOMEvents;
  return {
    ...viewProps,
    attributes: { ...own, ...attributes },
    nodeViews: nodeViews ?? {},
    handleDOMEvents: {
      ...handlers,
      beforeinput(view, event) {
        catchUp(view);
        return handlers?.beforeinput?.(view, event) === true || insertTypedText(view, event);
      },
    },
    dispatchTransaction: dispatch,
  };
}

/** The projection's pages in a plain view, the host's node views drawn by React into it. */
export function PagesView(props: PagesViewProps) {
  const { paged } = props;
  const { projection } = paged;
  const mount = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const latest = useRef(props);
  const host = useHostNodeViews(props.nodeViews);
  useLayoutEffect(() => {
    latest.current = props;
  });
  // Shows a state, and tells the events of it as the engine host would.
  const show = useRef((view: EditorView, state: EditorState, byTransaction: boolean) => {
    const before = view.state;
    if (before === state) return;
    view.updateState(state);
    const { events } = latest.current;
    events.afterCommit?.(view);
    if (!byTransaction) return;
    if (!state.selection.eq(before.selection)) events.onSelectionChange?.(state.selection, view);
    events.onUpdated?.(view, before);
  }).current;
  const dispatch = useRef(function dispatch(this: EditorView, tr: Transaction) {
    const { paged: current, events } = latest.current;
    events.onTransaction?.(tr, this);
    current.projection.receive(tr);
    show(this, current.projection.projection, true);
  }).current;
  const ties = useRef<ViewTies>({
    dispatch,
    catchUp(view) {
      // The selection the browser shows goes first, so drawing the latest state keeps it.
      readDomSelection(view);
      const { projection: current } = latest.current.paged.projection;
      if (view.state.doc !== current.doc) show(view, current, false);
    },
  }).current;
  const nodeViews = useRef(host.nodeViews);
  useLayoutEffect(() => {
    nodeViews.current = host.nodeViews;
  });
  useLayoutEffect(() => {
    const element = mount.current;
    if (!element) return undefined;
    const view = new EditorView(
      { mount: element },
      { state: projection.projection, ...directProps(latest.current, nodeViews.current, ties) },
    );
    viewRef.current = view;
    return () => {
      viewRef.current = null;
      latest.current.events.onUnmounted?.();
      view.destroy();
    };
  }, [projection, ties]);
  // The view is told mounted after the commit's other effects, and unmounted before them, so the
  // engine's view it takes over from, or hands over to, goes first and comes after.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const { events } = latest.current;
    events.afterCommit?.(view);
    events.onMounted?.(view);
  }, [projection]);
  const { viewProps, attributes } = props;
  useLayoutEffect(() => {
    viewRef.current?.setProps(directProps({ viewProps, attributes }, host.nodeViews, ties));
  }, [viewProps, attributes, host.nodeViews, ties]);
  useLayoutEffect(() => {
    const view = viewRef.current;
    if (view) show(view, paged.state, false);
  }, [paged.state, show]);
  return (
    <>
      <div ref={mount} />
      {host.portals}
    </>
  );
}
