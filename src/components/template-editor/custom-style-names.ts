// Renaming and deleting a custom style with what refers to it: the style in every scope's custom
// styles, a section's override of it too, and each block of the template's content in the style.

import { CUSTOM_STYLE_NAME } from '../../model/index.js';

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
  if (next.className === from) next.className = to ?? '';
  return next;
}

/**
 * A template, or one of its sections, with a custom style renamed, or deleted for null, in its
 * custom styles and its sections', and on each block of its content that has the style.
 */
export function withCustomStyleRenamed<T>(scope: T, from: string, to: string | null): T {
  return renamed(scope, from, to) as T;
}

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
  if (!CUSTOM_STYLE_NAME.test(name)) return labels.styleNameInvalid;
  return taken.includes(name) ? labels.styleNameTaken : null;
}
