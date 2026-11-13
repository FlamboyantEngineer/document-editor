// The template settings the template editor offers, as data: where each sits in a template, what
// kind of value it takes, and the card or section of the editor it belongs to. And reading and
// writing a setting by its path, where an absent value inherits from the parent template.

import { PAGE_SIZE_DIMENSIONS, type TemplateFile } from '../../model/index.js';

/** The kinds of value a setting takes. */
export type SettingKind =
  | { readonly type: 'text' }
  | { readonly type: 'length' }
  | {
      readonly type: 'number';
      readonly min?: number;
      readonly max?: number;
      readonly step?: number;
    }
  | { readonly type: 'color' }
  | { readonly type: 'boolean' }
  /** A size in points, such as a font's. */
  | { readonly type: 'points' }
  /** A font, from the editor's `fonts`, or its `codeFonts` for code, or typed. */
  | { readonly type: 'font'; readonly code?: boolean }
  /** A numbering format: a character for each level, such as `1.1` or `A.i`. */
  | { readonly type: 'numbering' }
  /** Four sides, in points, or for page margins in the page's own unit. */
  | {
      readonly type: 'sides';
      readonly unit: 'pt' | 'page';
      /** What one side is called, after its name, such as `margin` in `Top margin`. */
      readonly side: string;
    }
  | { readonly type: 'select'; readonly options: readonly { id: string; label: string }[] }
  /** A choice among a few, shown as segments. */
  | { readonly type: 'choice'; readonly options: readonly { id: string; label: string }[] };

/** A setting of a template. */
export interface TemplateSetting {
  /** Unique in its card or section. */
  readonly id: string;
  /** Where the setting sits in a template, below its card or section. */
  readonly path: readonly string[];
  readonly label: string;
  readonly kind: SettingKind;
  /** Words the settings filter also finds the setting by. */
  readonly keywords?: readonly string[];
  /** A short caption under the field. */
  readonly hint?: string;
  /** Whether only the document's settings may set it, never a section's. */
  readonly documentOnly?: boolean;
  /** Why a value is not valid, shown on the field; null while it is. */
  readonly check?: (value: unknown) => string | null;
}

/**
 * The rows of a style a card starts with: its font and size, its weight, slant and underline,
 * its alignment (with justified or not), colour, spacing, line height, and numbering.
 */
export type StylePart =
  'font' | 'face' | 'align' | 'justify' | 'colour' | 'spacing' | 'lineHeight' | 'numbering';

/** A card of settings in a section: a style's rows, then its own settings. */
export interface TemplateSettingCard {
  /** Unique in its section. */
  readonly id: string;
  readonly title: string;
  /** Where the card's settings sit, below the section's scope. */
  readonly path: readonly string[];
  readonly style?: readonly StylePart[];
  /** Code takes its fonts from the editor's `codeFonts`. */
  readonly code?: boolean;
  readonly settings?: readonly TemplateSetting[];
}

/** A section of the template editor: its settings and cards, below a scope of the template. */
export interface TemplateSettingSection {
  readonly id: string;
  readonly title: string;
  /** The path its settings' paths start from. */
  readonly scope: readonly string[];
  readonly settings: readonly TemplateSetting[];
  readonly cards?: readonly TemplateSettingCard[];
  /** Whether only the document's settings may set it, never a section's. */
  readonly documentOnly?: boolean;
}

/** The text of the template editor's rows. */
export interface TemplateSettingsLabels {
  /** A custom style name another style has. */
  readonly styleNameTaken: string;
  /** A custom style name that is not a letter followed by letters, digits, `_` or `-`. */
  readonly styleNameInvalid: string;
  /** The names of four sides, before what a side is called, such as `Top` in `Top margin`. */
  readonly sides: Readonly<Record<'top' | 'right' | 'bottom' | 'left', string>>;
  /** Names numbering's switch. */
  readonly numbered: string;
}

/** The English text of the template editor's rows. */
export const DEFAULT_TEMPLATE_SETTINGS_LABELS: TemplateSettingsLabels = {
  styleNameTaken: 'Another style has this name.',
  styleNameInvalid: 'Start with a letter; then up to 15 letters, digits, _ or -.',
  sides: { top: 'Top', right: 'Right', bottom: 'Bottom', left: 'Left' },
  numbered: 'Numbered',
};

/** A setting of a kind at a path, written with dots. */
export const setting = (path: string, label: string, kind: SettingKind): TemplateSetting => ({
  id: path,
  path: path.split('.'),
  label,
  kind,
});

/** A choice from a list. */
export const select = (...options: [string, string][]): SettingKind => ({
  type: 'select',
  options: options.map(([id, label]) => ({ id, label })),
});

/** A choice among a few, as segments. */
export const choice = (...options: [string, string][]): SettingKind => ({
  type: 'choice',
  options: options.map(([id, label]) => ({ id, label })),
});

/** What a numbering format's characters number with. */
export const NUMBERING_HINT = '1, a, A, i or I for each level, such as 1.1, A.1 or I-a)';

/** A numbering format's setting. */
export const numberingSetting = (path: string, label: string): TemplateSetting => ({
  ...setting(path, label, { type: 'numbering' }),
  hint: NUMBERING_HINT,
});

/** The page sizes a template may name. */
export const PAGE_SIZES = Object.keys(PAGE_SIZE_DIMENSIONS);

/** The settings of a text style: its font, colour, line height, alignment and spacing. */
export const TEXT_STYLE_SETTINGS: readonly TemplateSetting[] = [
  setting('font', 'Font', { type: 'font' }),
  setting('size', 'Size', { type: 'points' }),
  setting('weight', 'Weight', { type: 'number', min: 100, max: 900, step: 100 }),
  setting('italic', 'Italic', { type: 'boolean' }),
  setting('underline', 'Underline', { type: 'boolean' }),
  setting('color', 'Colour', { type: 'color' }),
  setting('lineHeight', 'Line height', { type: 'number', min: 0.8, max: 3, step: 0.05 }),
  setting(
    'alignment',
    'Alignment',
    select(['left', 'Left'], ['center', 'Centre'], ['right', 'Right'], ['justify', 'Justify']),
  ),
  setting('spaceBefore', 'Space before', { type: 'points' }),
  setting('spaceAfter', 'Space after', { type: 'points' }),
];

/** The text styles, each a card, by their key in a template's styles, in reading order. */
export const TEXT_STYLES = [
  { id: 'title', label: 'Title' },
  ...[1, 2, 3, 4, 5, 6].map((level) => ({
    id: `heading${String(level)}`,
    label: `Heading ${String(level)}`,
  })),
  { id: 'paragraph', label: 'Paragraph' },
] as const;

/** The fonts a font field suggests unless the editor is given its own. */
export const DEFAULT_FONTS: readonly string[] = [
  'Arial',
  'Calibri',
  'Cambria',
  'Courier New',
  'Georgia',
  'Helvetica',
  'Segoe UI',
  'Times New Roman',
  'Verdana',
];

/** The monospace fonts a code font field suggests unless the editor is given its own. */
export const DEFAULT_CODE_FONTS: readonly string[] = [
  'Cascadia Code',
  'Consolas',
  'Courier New',
  'Fira Code',
  'JetBrains Mono',
  'Menlo',
  'Monaco',
  'Source Code Pro',
];

type Settings = Record<string, unknown>;

const isRecord = (value: unknown): value is Settings =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The value at a path of a template, or undefined. */
export function settingAt(template: TemplateFile, path: readonly string[]): unknown {
  let value: unknown = template;
  for (const key of path) {
    if (!isRecord(value) && !Array.isArray(value)) return undefined;
    value = (value as Settings)[key];
  }
  return value;
}

const isGone = (value: unknown) =>
  value === null || value === undefined || (isRecord(value) && Object.keys(value).length === 0);

// A list with an entry set at an index, or set to null, so it inherits the parent's entry at that
// index (lists merge by index); nulls at the end go, and a list of nulls goes too.
function withEntry(target: unknown, index: number, child: unknown): unknown[] | undefined {
  const list: unknown[] = Array.isArray(target) ? [...(target as unknown[])] : [];
  while (list.length <= index) list.push(null);
  list[index] = isGone(child) ? null : child;
  while (list.length && list[list.length - 1] === null) list.pop();
  return list.length ? list : undefined;
}

// An object with a value set at a path, or taken out when it is null; objects left empty go too.
// A number key sets an entry of a list.
function withValue(target: unknown, path: readonly string[], value: unknown): unknown {
  const [key, ...rest] = path;
  if (key === undefined) return target;
  const current = isRecord(target) || Array.isArray(target) ? (target as Settings)[key] : undefined;
  const child = rest.length === 0 ? value : withValue(current, rest, value);
  if (/^\d+$/.test(key)) return withEntry(target, Number(key), child);
  const next: Settings = isRecord(target) ? { ...target } : {};
  if (isGone(child)) delete next[key];
  else next[key] = child;
  return next;
}

/**
 * A template with a setting changed: null or undefined inherits it from the parent again, and an
 * empty string is the template's own empty value. A number in the path is an index in a list,
 * whose other entries stay as they are, or null to inherit the parent's.
 */
export function withSetting(
  template: TemplateFile,
  path: readonly string[],
  value: unknown,
): TemplateFile {
  return (withValue(template, path, value) ?? {}) as TemplateFile;
}
