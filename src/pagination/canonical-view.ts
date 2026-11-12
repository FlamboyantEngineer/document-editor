// The view that renders the pages, as the canonical state's view. Toolbars, menus and commands
// read and change the canonical state, the whole document; the pages are the projection's. This
// view shows them the canonical state, takes their transactions to the canonical dispatch, and
// maps the positions its DOM methods take and give between the two documents. Everything else is
// the projection view's own.

import type { EditorState, Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { ProjectionMap } from './projection-map.js';

/** What the canonical view reads and where its transactions go. */
export interface CanonicalViewSource {
  canonical(): EditorState;
  map(): ProjectionMap;
  /** Takes a transaction of the canonical state, as the host commits it. */
  dispatch(tr: Transaction): void;
}

type Side = -1 | 1;

// A canonical position on the projection; the nearest one before it when it is gone there.
function onPages(map: ProjectionMap, pos: number, side: Side = 1): number {
  return map.toProjection(pos, side) ?? map.toProjection(pos, -side as Side) ?? 0;
}

// The DOM methods that take or give positions, on canonical positions.
function mappedMethods(view: EditorView, source: CanonicalViewSource) {
  return {
    dispatch: (tr: Transaction) => source.dispatch(tr),
    coordsAtPos: (pos: number, side?: number) =>
      view.coordsAtPos(onPages(source.map(), pos, side && side < 0 ? -1 : 1), side),
    domAtPos: (pos: number, side?: number) =>
      view.domAtPos(onPages(source.map(), pos, side && side < 0 ? -1 : 1), side),
    nodeDOM: (pos: number) => {
      const at = source.map().toProjection(pos, 1);
      return at === null ? null : view.nodeDOM(at);
    },
    posAtDOM: (node: Node, offset: number, bias?: number) => {
      const map = source.map();
      return map.toCanonical(view.posAtDOM(node, offset, bias)) ?? 0;
    },
    posAtCoords: (coords: { left: number; top: number }) => {
      const found = view.posAtCoords(coords);
      if (!found) return null;
      const map = source.map();
      const pos = map.toCanonical(found.pos);
      if (pos === null) return null;
      const inside = found.inside < 0 ? -1 : map.toCanonical(found.inside, 1);
      return { pos, inside: inside ?? -1 };
    },
  };
}

/**
 * The projection's view as a view of the canonical state: `state` is the canonical state,
 * `dispatch` goes to the canonical dispatch, and `coordsAtPos`, `domAtPos`, `nodeDOM`, `posAtDOM`
 * and `posAtCoords` take and give canonical positions.
 */
export function canonicalView(view: EditorView, source: CanonicalViewSource): EditorView {
  const methods: Record<PropertyKey, unknown> = mappedMethods(view, source);
  return new Proxy(view, {
    get(target, key) {
      if (key === 'state') return source.canonical();
      if (Object.hasOwn(methods, key)) return methods[key];
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
    },
  });
}
