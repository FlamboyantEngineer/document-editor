// The canonical plugins' handlers of clicks, drops, key presses and scrolling, and the attributes
// they give the editor, run through the pages: on the canonical view, at canonical positions.

import type { EditorProps, EditorView } from 'prosemirror-view';
import { type CanonicalPluginsSource, handled, offered } from './canonical-plugins.js';

type Props = EditorProps;
type Click = 'handleClick' | 'handleDoubleClick' | 'handleTripleClick';
type ClickOn = 'handleClickOn' | 'handleDoubleClickOn' | 'handleTripleClickOn';

/** A click's handler on the canonical view, at the canonical position. */
export function clickOn(source: CanonicalPluginsSource, prop: Click) {
  return (view: EditorView, pos: number, event: MouseEvent): boolean => {
    const at = source.map().toCanonical(pos);
    if (at === null) return false;
    return handled(view, source, {
      has: (plugin) => Boolean(plugin.props[prop]),
      handle: (plugin, canonical) => plugin.props[prop]?.call(plugin, canonical, at, event),
    });
  };
}

/**
 * A click's handler on each node around it, as ProseMirror calls it: on the canonical view, with
 * the canonical position, node and node position. A node only the pages hold, such as a page, is
 * not offered.
 */
export function clickOnNode(source: CanonicalPluginsSource, prop: ClickOn) {
  return (...[view, pos, , nodePos, event, direct]: Parameters<NonNullable<Props[ClickOn]>>) => {
    const map = source.map();
    const at = map.toCanonical(pos);
    const nodeAt = map.toCanonical(nodePos, 1);
    if (at === null || nodeAt === null) return false;
    const node = source.canonical().doc.nodeAt(nodeAt);
    if (!node) return false;
    return handled(view, source, {
      has: (plugin) => Boolean(plugin.props[prop]),
      handle: (plugin, canonical) =>
        plugin.props[prop]?.call(plugin, canonical, at, node, nodeAt, event, direct),
    });
  };
}

/** The canonical plugins' drop handlers, with the slice dropped, which is canonical content. */
export function canonicalDrop(source: CanonicalPluginsSource) {
  return (...[view, event, slice, moved]: Parameters<NonNullable<Props['handleDrop']>>) =>
    handled(view, source, {
      has: (plugin) => Boolean(plugin.props.handleDrop),
      handle: (plugin, canonical) =>
        plugin.props.handleDrop?.call(plugin, canonical, event, slice, moved),
    });
}

/** The canonical plugins' key press handlers; with none, a key press costs nothing more. */
export function canonicalKeyPress(source: CanonicalPluginsSource) {
  return (view: EditorView, event: KeyboardEvent): boolean =>
    handled(view, source, {
      has: (plugin) => Boolean(plugin.props.handleKeyPress),
      handle: (plugin, canonical) => plugin.props.handleKeyPress?.call(plugin, canonical, event),
    });
}

/** The canonical plugins' scrolling to the selection, which they may do themselves. */
export function canonicalScroll(source: CanonicalPluginsSource) {
  return (view: EditorView): boolean =>
    offered(view, source, {
      input: false,
      has: (plugin) => Boolean(plugin.props.handleScrollToSelection),
      handle: (plugin, canonical) => plugin.props.handleScrollToSelection?.call(plugin, canonical),
    });
}

/**
 * The attributes the canonical plugins give the editor, read from the canonical state, merged as
 * ProseMirror merges them: classes joined, and the first plugin's value of any other attribute.
 */
export function canonicalAttributes(source: CanonicalPluginsSource) {
  return (): Record<string, string> => {
    const canonical = source.canonical();
    const merged: Record<string, string> = {};
    for (const plugin of canonical.plugins) {
      const prop = plugin.props.attributes;
      const attrs = typeof prop === 'function' ? prop.call(plugin, canonical) : prop;
      for (const [name, value] of Object.entries(attrs ?? {})) {
        if (name === 'class') merged.class = merged.class ? `${merged.class} ${value}` : value;
        else merged[name] ??= value;
      }
    }
    return merged;
  };
}
