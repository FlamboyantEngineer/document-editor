// The canonical state's plugins, run through the pages. No view holds the canonical state: the
// view that renders the projection stands in for one (`canonicalView`). The canonical plugins'
// views run on it, and are updated as the canonical state changes; their keys, text input, clicks
// and DOM events run on it, with positions mapped, before the projection's own handling. A press
// stays the projection's: it places the caret on the pages, or starts a cell drag across them.

import type { Slice } from 'prosemirror-model';
import { type EditorState, Plugin, type PluginView, type Transaction } from 'prosemirror-state';
import type { EditorProps, EditorView } from 'prosemirror-view';
import { canonicalView } from './canonical-view.js';
import type { ProjectionMap } from './projection-map.js';

/** What the canonical plugins run on, and how their input reaches the canonical state. */
export interface CanonicalPluginsSource {
  canonical(): EditorState;
  map(): ProjectionMap;
  /** Takes a canonical transaction and shows it on the pages at once. */
  dispatch(tr: Transaction): void;
  /** Readies the canonical state for input: the selection the pages show, mirrored there. */
  prepare(): void;
}

// The DOM events handed to the canonical plugins; a press is the projection's.
const DOM_EVENTS = [
  'beforeinput',
  'compositionstart',
  'compositionend',
  'focus',
  'blur',
  'copy',
  'cut',
  'contextmenu',
  'dragstart',
  'mouseup',
] as const;

type Props = EditorProps;
type Handler = (plugin: Plugin, view: EditorView) => boolean | void | undefined;

// Each projection view as its canonical view.
const canonicalViews = new WeakMap<EditorView, EditorView>();

/** The canonical view of a projection view, the same one each time (`canonicalView`). */
export function canonicalViewOf(view: EditorView, source: CanonicalPluginsSource): EditorView {
  let canonical = canonicalViews.get(view);
  if (!canonical) {
    canonical = canonicalView(view, source);
    canonicalViews.set(view, canonical);
  }
  return canonical;
}

// An event for the canonical plugins: which of them take it, and how each is handed it.
interface Offer {
  readonly has: (plugin: Plugin) => boolean;
  readonly handle: Handler;
}

// Whether a canonical plugin handles an event, in order, on the canonical view; input that acts on
// the selection has the selection the pages show mirrored first. With no plugin that takes it,
// nothing is done, so typing costs nothing more.
function offered(
  view: EditorView,
  source: CanonicalPluginsSource,
  { has, handle, input }: Offer & { readonly input: boolean },
): boolean {
  const takers = source.canonical().plugins.filter(has);
  if (takers.length === 0) return false;
  if (input) source.prepare();
  const canonical = canonicalViewOf(view, source);
  return takers.some((plugin) => handle(plugin, canonical) === true);
}

// Whether a canonical plugin handles input, with the selection the pages show mirrored first.
const handled = (view: EditorView, source: CanonicalPluginsSource, offer: Offer) =>
  offered(view, source, { ...offer, input: true });

// The canonical plugins' views, started on the canonical view and updated as its state changes.
function pluginViews(view: EditorView, source: CanonicalPluginsSource): PluginView {
  const canonical = canonicalViewOf(view, source);
  let shown = source.canonical();
  const start = (state: EditorState) =>
    state.plugins.flatMap((plugin) => (plugin.spec.view ? [plugin.spec.view(canonical)] : []));
  let views = start(shown);
  const stop = () => {
    for (const started of views) started.destroy?.();
  };
  return {
    update() {
      const now = source.canonical();
      if (now === shown) return;
      const previous = shown;
      shown = now;
      if (now.plugins === previous.plugins) {
        for (const started of views) started.update?.(canonical, previous);
        return;
      }
      stop();
      views = start(now);
    },
    destroy: stop,
  };
}

// A click's handler on the canonical view, at the canonical position.
function clickOn(
  source: CanonicalPluginsSource,
  prop: 'handleClick' | 'handleDoubleClick' | 'handleTripleClick',
) {
  return (view: EditorView, pos: number, event: MouseEvent): boolean => {
    const at = source.map().toCanonical(pos);
    if (at === null) return false;
    return handled(view, source, {
      has: (plugin) => Boolean(plugin.props[prop]),
      handle: (plugin, canonical) => plugin.props[prop]?.call(plugin, canonical, at, event),
    });
  };
}

// Text typed on the pages, offered to the canonical plugins, as input rules read it.
function textInput(source: CanonicalPluginsSource): NonNullable<Props['handleTextInput']> {
  return (view, ...[from, to, text]) =>
    handled(view, source, {
      has: (plugin) => Boolean(plugin.props.handleTextInput),
      handle(plugin, canonical) {
        const map = source.map();
        const start = map.toCanonical(from, -1);
        const end = map.toCanonical(to, 1);
        if (start === null || end === null) return false;
        const typed = () => source.canonical().tr.insertText(text, start, end);
        return plugin.props.handleTextInput?.call(plugin, canonical, start, end, text, typed);
      },
    });
}

function domEvents(source: CanonicalPluginsSource): NonNullable<Props['handleDOMEvents']> {
  return Object.fromEntries(
    DOM_EVENTS.map((name) => [
      name,
      (view: EditorView, event: Event) =>
        offered(view, source, {
          has: (plugin) => Boolean(plugin.props.handleDOMEvents?.[name]),
          handle(plugin, canonical) {
            const handler = plugin.props.handleDOMEvents?.[name] as
              ((view: EditorView, event: Event) => boolean | undefined) | undefined;
            return handler?.call(plugin, canonical, event);
          },
          input: false,
        }),
    ]),
  );
}

/** The canonical plugins' keys, run on the canonical view of the projection view. */
export function canonicalKeys(source: CanonicalPluginsSource) {
  return (view: EditorView, event: KeyboardEvent): boolean =>
    handled(view, source, {
      has: (plugin) => Boolean(plugin.props.handleKeyDown),
      handle: (plugin, canonical) => plugin.props.handleKeyDown?.call(plugin, canonical, event),
    });
}

/** The canonical plugins' paste handlers, run on the canonical view of the projection view. */
export function canonicalPaste(source: CanonicalPluginsSource) {
  return (view: EditorView, event: ClipboardEvent, slice: Slice): boolean =>
    handled(view, source, {
      has: (plugin) => Boolean(plugin.props.handlePaste),
      handle: (plugin, canonical) =>
        plugin.props.handlePaste?.call(plugin, canonical, event, slice),
    });
}

type NodeViews = NonNullable<Props['nodeViews']>;
type NodeViewConstructor = NodeViews[string];

// Each canonical node view as drawn on a projection's pages, the same one each time.
const drawnNodeViews = new WeakMap<
  CanonicalPluginsSource,
  WeakMap<NodeViewConstructor, NodeViewConstructor>
>();

// A canonical node view drawn on the pages: it sees the canonical view, and its node's canonical
// position.
function onPages(make: NodeViewConstructor, source: CanonicalPluginsSource): NodeViewConstructor {
  let drawnBy = drawnNodeViews.get(source);
  if (!drawnBy) {
    drawnBy = new WeakMap();
    drawnNodeViews.set(source, drawnBy);
  }
  let drawn = drawnBy.get(make);
  if (!drawn) {
    drawn = (node, view, ...[getPos, ...rest]) => {
      const canonicalPos = () => {
        const pos = getPos();
        return pos === undefined ? undefined : (source.map().toCanonical(pos, 1) ?? undefined);
      };
      return make(node, canonicalViewOf(view, source), canonicalPos, ...rest);
    };
    drawnBy.set(make, drawn);
  }
  return drawn;
}

// The canonical plugins' node views, drawn on the pages.
function canonicalNodeViews(source: CanonicalPluginsSource): NodeViews {
  const views: Record<string, NodeViewConstructor> = {};
  for (const plugin of source.canonical().plugins) {
    for (const [name, make] of Object.entries(plugin.props.nodeViews ?? {})) {
      views[name] ??= onPages(make, source);
    }
  }
  return views;
}

// The canonical plugins' node views, read from the plugins the canonical state has as the view
// builds its node views, which is only once the projection holds it.
function lazyNodeViews(source: CanonicalPluginsSource): NodeViews {
  const current = () => canonicalNodeViews(source);
  return new Proxy<NodeViews>(
    {},
    {
      ownKeys: () => Reflect.ownKeys(current()),
      getOwnPropertyDescriptor: (_target, key) => Reflect.getOwnPropertyDescriptor(current(), key),
      get: (_target, key) => Reflect.get(current(), key),
      has: (_target, key) => Reflect.has(current(), key),
    },
  );
}

/**
 * A projection plugin that runs the canonical plugins' views on the canonical view, and hands
 * them text input, clicks and DOM events; keys and paste go through `canonicalKeys` and
 * `canonicalPaste`, in the projection's own order.
 */
export function canonicalPlugins(source: CanonicalPluginsSource): Plugin {
  return new Plugin({
    view: (view) => pluginViews(view, source),
    props: {
      nodeViews: lazyNodeViews(source),
      handleTextInput: textInput(source),
      handleClick: clickOn(source, 'handleClick'),
      handleDoubleClick: clickOn(source, 'handleDoubleClick'),
      handleTripleClick: clickOn(source, 'handleTripleClick'),
      handleDOMEvents: domEvents(source),
    },
  });
}
