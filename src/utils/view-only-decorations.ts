// Decorations drawn for the person working in the editor, such as search matches, proofing issues,
// other people's selections and carets, placeholders, offered completions and layout debugging,
// are view-only: a printed snapshot leaves them out. They are made through these helpers, which
// mark each one with one common hook, the `data-de-view-only` attribute, which names the
// attributes and classes an inline or node decoration adds (also recorded in its spec), so the
// snapshot takes them off again without knowing the features that drew them.

import { Decoration, type DecorationAttrs, type EditorView } from 'prosemirror-view';

/** The hook every view-only decoration puts on the element it draws or decorates. */
export const VIEW_ONLY_ATTRIBUTE = 'data-de-view-only';

/** The attributes and classes a view-only decoration adds. */
export interface ViewOnlyHooks {
  readonly attributes: readonly string[];
  readonly classes: readonly string[];
}

/** The range a decoration covers. */
export interface DecorationRange {
  readonly from: number;
  readonly to: number;
}

// The spec key that records a view-only decoration's hooks.
const VIEW_ONLY_SPEC = 'viewOnly';

function hooksOf(attrs: DecorationAttrs): ViewOnlyHooks {
  return {
    attributes: Object.keys(attrs).filter((name) => name !== 'nodeName' && name !== 'class'),
    classes: (attrs.class ?? '').split(/\s+/).filter(Boolean),
  };
}

// The hook's value: the attributes the decoration adds, and its classes as `.name`, so the
// markup tells a snapshot what to take off without the view that drew it.
function hookValue({ attributes, classes }: ViewOnlyHooks): string {
  return [...attributes, ...classes.map((name) => `.${name}`)].join(' ');
}

function viewOnlyParts(attrs: DecorationAttrs, spec: object | undefined) {
  const hooks = hooksOf(attrs);
  return {
    attrs: { ...attrs, [VIEW_ONLY_ATTRIBUTE]: hookValue(hooks) },
    spec: { ...spec, [VIEW_ONLY_SPEC]: hooks },
  };
}

/** An inline decoration only the editor's view shows. */
export function viewOnlyInline(
  { from, to }: DecorationRange,
  attrs: DecorationAttrs,
  spec?: object,
): Decoration {
  const parts = viewOnlyParts(attrs, spec);
  return Decoration.inline(from, to, parts.attrs, parts.spec);
}

/** A node decoration only the editor's view shows. */
export function viewOnlyNode(
  { from, to }: DecorationRange,
  attrs: DecorationAttrs,
  spec?: object,
): Decoration {
  const parts = viewOnlyParts(attrs, spec);
  return Decoration.node(from, to, parts.attrs, parts.spec);
}

/** A widget only the editor's view shows: its element carries the hook. */
export function viewOnlyWidget(
  pos: number,
  toDOM: (view: EditorView, getPos: () => number | undefined) => HTMLElement,
  spec?: Parameters<typeof Decoration.widget>[2],
): Decoration {
  const draw = (view: EditorView, getPos: () => number | undefined) => {
    const element = toDOM(view, getPos);
    element.setAttribute(VIEW_ONLY_ATTRIBUTE, 'widget');
    return element;
  };
  return Decoration.widget(pos, draw, spec);
}

/** The hooks a decoration adds when it is view-only, or null. */
export function viewOnlyHooksOf(decoration: Decoration): ViewOnlyHooks | null {
  const spec = decoration.spec as Record<string, ViewOnlyHooks | undefined>;
  return spec[VIEW_ONLY_SPEC] ?? null;
}
