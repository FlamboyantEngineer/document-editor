// Decorations drawn for the person working in the editor, such as search matches, proofing issues,
// other people's selections and layout debugging, are view-only: a printed snapshot leaves them
// out. They are made through these helpers, which mark each one with one common hook, the
// `data-de-view-only` attribute, and record in the decoration's spec the attributes and classes
// it adds, so the snapshot takes them off again without knowing the features that drew them.

import { Decoration, type DecorationAttrs } from 'prosemirror-view';

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

function viewOnlySpec(attrs: DecorationAttrs, spec: object | undefined) {
  const hooks: ViewOnlyHooks = {
    attributes: Object.keys(attrs).filter((name) => name !== 'nodeName' && name !== 'class'),
    classes: (attrs.class ?? '').split(/\s+/).filter(Boolean),
  };
  return { ...spec, [VIEW_ONLY_SPEC]: hooks };
}

const marked = (attrs: DecorationAttrs): DecorationAttrs => ({
  ...attrs,
  [VIEW_ONLY_ATTRIBUTE]: 'true',
});

/** An inline decoration only the editor's view shows. */
export function viewOnlyInline(
  { from, to }: DecorationRange,
  attrs: DecorationAttrs,
  spec?: object,
): Decoration {
  return Decoration.inline(from, to, marked(attrs), viewOnlySpec(attrs, spec));
}

/** A node decoration only the editor's view shows. */
export function viewOnlyNode(
  { from, to }: DecorationRange,
  attrs: DecorationAttrs,
  spec?: object,
): Decoration {
  return Decoration.node(from, to, marked(attrs), viewOnlySpec(attrs, spec));
}

/** The hooks a decoration adds when it is view-only, or null. */
export function viewOnlyHooksOf(decoration: Decoration): ViewOnlyHooks | null {
  const spec = decoration.spec as Record<string, ViewOnlyHooks | undefined>;
  return spec[VIEW_ONLY_SPEC] ?? null;
}
