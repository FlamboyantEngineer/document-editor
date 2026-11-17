// Renaming and deleting a custom style with what refers to it: the style in every scope's custom
// styles, a section's override of it too, and each block of the template's content in the style
// (its stored `attrs.style`).

type Settings = Record<string, unknown>;

const isRecord = (value: unknown): value is Settings =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Custom styles with one renamed in place, keeping their order, or taken out for null.
function renamedStyles(custom: Settings, from: string, to: string | null): Settings {
  return Object.fromEntries(
    Object.entries(custom).flatMap(([key, style]) =>
      key !== from ? [[key, style]] : to === null ? [] : [[to, style]],
    ),
  );
}

// A value with the style renamed wherever it is named, below it; extensions are the host's.
function renamed(value: unknown, from: string, to: string | null): unknown {
  if (Array.isArray(value)) return value.map((each) => renamed(each, from, to));
  if (!isRecord(value)) return value;
  const next = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      key === 'extensions' ? child : renamed(child, from, to),
    ]),
  );
  if (isRecord(next.custom) && next.custom[from] !== undefined)
    next.custom = renamedStyles(next.custom, from, to);
  return isRecord(next.attrs) && next.attrs.style === from ? restyled(next, to) : next;
}

// A block of stored content in the style, in the renamed one, or, for null, in none: a heading
// that took the style becomes a paragraph of the same text.
function restyled(block: Settings, to: string | null): Settings {
  const { style: _style, ...attrs } = block.attrs as Settings;
  if (to !== null) return { ...block, attrs: { ...attrs, style: to } };
  const { attrs: _attrs, ...rest } = block;
  if (block.type === 'heading') return { ...rest, type: 'paragraph' };
  return Object.keys(attrs).length ? { ...rest, attrs } : rest;
}

/**
 * A template, or one of its sections, with a custom style renamed, or deleted for null, in its
 * custom styles and its sections', and on each block of its content that has the style.
 */
export function withCustomStyleRenamed<T>(scope: T, from: string, to: string | null): T {
  return renamed(scope, from, to) as T;
}

// A name a custom style takes in the editor: a letter, then up to 15 letters, digits and
// underscores. A stored name may hold hyphens too (`CUSTOM_STYLE_NAME`), and keeps them.
const STYLE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,15}$/;

/** Why a custom style may not take a name, or null when it may. */
export function customStyleNameError(
  name: string,
  {
    current,
    taken,
    labels,
  }: {
    /** The style's name now, which it may keep. */
    readonly current: string;
    /** The names of the scope's custom styles, its own and those it inherits. */
    readonly taken: readonly string[];
    readonly labels: { readonly styleNameTaken: string; readonly styleNameInvalid: string };
  },
): string | null {
  if (name === current) return null;
  if (!STYLE_NAME.test(name)) return labels.styleNameInvalid;
  return taken.includes(name) ? labels.styleNameTaken : null;
}
