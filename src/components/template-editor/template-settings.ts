// The template settings the template editor offers, as data: where each sits in a template, what
// kind of value it takes, and the section of the editor it belongs to. And reading and writing a
// setting by its path, where an absent or empty value inherits from the parent template.

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
  | { readonly type: 'select'; readonly options: readonly { id: string; label: string }[] };

/** A setting of a template. */
export interface TemplateSetting {
  /** Unique in the editor. */
  readonly id: string;
  /** Where the setting sits in a template, below its scope. */
  readonly path: readonly string[];
  readonly label: string;
  readonly kind: SettingKind;
  /** Words the settings filter also finds the setting by. */
  readonly keywords?: readonly string[];
}

/** A section of the template editor: its settings, below a scope of the template. */
export interface TemplateSettingSection {
  readonly id: string;
  readonly title: string;
  /** The path its settings' paths start from, which a style picker may choose. */
  readonly scope: readonly string[];
  readonly settings: readonly TemplateSetting[];
}

const text = { type: 'text' } as const;
const length = { type: 'length' } as const;
const color = { type: 'color' } as const;
const boolean = { type: 'boolean' } as const;
const select = (...options: [string, string][]): SettingKind => ({
  type: 'select',
  options: options.map(([id, label]) => ({ id, label })),
});

const setting = (path: string, label: string, kind: SettingKind): TemplateSetting => ({
  id: path,
  path: path.split('.'),
  label,
  kind,
});

/** The page sizes a template may name. */
export const PAGE_SIZES = Object.keys(PAGE_SIZE_DIMENSIONS);

/** The settings of a text style: its font, colour, line height, alignment and spacing. */
export const TEXT_STYLE_SETTINGS: readonly TemplateSetting[] = [
  setting('font', 'Font', text),
  setting('size', 'Size', length),
  setting('weight', 'Weight', { type: 'number', min: 100, max: 900, step: 100 }),
  setting('italic', 'Italic', boolean),
  setting('underline', 'Underline', boolean),
  setting('color', 'Colour', color),
  setting('lineHeight', 'Line height', {
    type: 'number',
    min: 0.8,
    max: 3,
    step: 0.05,
  }),
  setting(
    'alignment',
    'Alignment',
    select(['left', 'Left'], ['center', 'Centre'], ['right', 'Right'], ['justify', 'Justify']),
  ),
  setting('spaceBefore', 'Space before', length),
  setting('spaceAfter', 'Space after', length),
];

/** The text styles the style picker offers, by their key in a template's styles. */
export const TEXT_STYLES = [
  { id: 'paragraph', label: 'Paragraph' },
  { id: 'title', label: 'Title' },
  ...[1, 2, 3, 4, 5, 6].map((level) => ({
    id: `heading${String(level)}`,
    label: `Heading ${String(level)}`,
  })),
  { id: 'codeBlock', label: 'Code block' },
] as const;

/** The editor's sections, in order, below the text styles. */
export const TEMPLATE_SECTIONS: readonly TemplateSettingSection[] = [
  {
    id: 'page',
    title: 'Page setup',
    scope: ['page'],
    settings: [
      setting(
        'size',
        'Page size',
        select(...PAGE_SIZES.map((size): [string, string] => [size, size])),
      ),
      setting(
        'orientation',
        'Orientation',
        select(['portrait', 'Portrait'], ['landscape', 'Landscape']),
      ),
      setting('margins.top', 'Top margin', length),
      setting('margins.right', 'Right margin', length),
      setting('margins.bottom', 'Bottom margin', length),
      setting('margins.left', 'Left margin', length),
    ],
  },
  {
    id: 'regions',
    title: 'Header & footer',
    scope: [],
    settings: [
      setting('header.height', 'Header height', length),
      setting('header.spacingToContent', 'Space below the header', length),
      setting('footer.height', 'Footer height', length),
      setting('footer.spacingToContent', 'Space above the footer', length),
    ],
  },
  {
    id: 'lists',
    title: 'Lists',
    scope: ['styles', 'list'],
    settings: [
      setting('bullet', 'Bullet', text),
      setting('format', 'Numbering format', text),
      setting('indentation', 'Indentation', length),
      setting('spaceBefore', 'Space before', length),
      setting('spaceAfter', 'Space after', length),
    ],
  },
  {
    id: 'tables',
    title: 'Tables',
    scope: ['styles', 'table'],
    settings: [
      setting('border.width', 'Border width', length),
      setting('border.color', 'Border colour', color),
      setting('cellPadding', 'Cell padding', length),
      setting('header.background', 'Header background', color),
      setting('header.color', 'Header text colour', color),
      setting('rows.odd', 'Odd rows', color),
      setting('rows.even', 'Even rows', color),
      setting('repeatHeader', 'Repeat the header on each page', boolean),
      setting('caption.placement', 'Caption', select(['above', 'Above'], ['below', 'Below'])),
    ],
  },
  {
    id: 'code',
    title: 'Code blocks',
    scope: ['styles', 'codeBlock'],
    settings: [
      setting('background', 'Background', color),
      setting('caption.placement', 'Caption', select(['above', 'Above'], ['below', 'Below'])),
    ],
  },
  {
    id: 'footnotes',
    title: 'Footnotes',
    scope: ['footnotes'],
    settings: [
      setting(
        'numbering',
        'Numbering',
        select(['document', 'Through the document'], ['page', 'On each page']),
      ),
      setting('separator.enabled', 'Separator line', boolean),
      setting('separator.color', 'Separator colour', color),
      setting('spacingToContent', 'Space above', length),
      setting('text.size', 'Text size', length),
    ],
  },
  {
    id: 'contents',
    title: 'Table of contents',
    scope: ['styles', 'contents'],
    settings: [
      setting('leader', 'Leader', text),
      setting('title.size', 'Title size', length),
      setting('entry.size', 'Entry size', length),
    ],
  },
  {
    id: 'change-bars',
    title: 'Change bars',
    scope: ['changeBars'],
    settings: [
      setting('insertions.color', 'Insertions', color),
      setting('deletions.color', 'Deletions', color),
      setting('modifications.color', 'Modifications', color),
      setting('side', 'Side', select(['left', 'Left'], ['right', 'Right'])),
      setting('width', 'Width', length),
    ],
  },
];

type Settings = Record<string, unknown>;

const isRecord = (value: unknown): value is Settings =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The value at a path of a template, or undefined. */
export function settingAt(template: TemplateFile, path: readonly string[]): unknown {
  let value: unknown = template;
  for (const key of path) {
    if (!isRecord(value)) return undefined;
    value = value[key];
  }
  return value;
}

// An object with a value set at a path, or taken out when it is null; objects left empty go too.
function withValue(target: Settings, path: readonly string[], value: unknown): Settings {
  const [key, ...rest] = path;
  if (key === undefined) return target;
  const next: Settings = { ...target };
  const child =
    rest.length === 0 ? value : withValue(isRecord(target[key]) ? target[key] : {}, rest, value);
  if (
    child === null ||
    child === undefined ||
    (isRecord(child) && Object.keys(child).length === 0)
  ) {
    delete next[key];
  } else {
    next[key] = child;
  }
  return next;
}

/**
 * A template with a setting changed: null, undefined or an empty string inherits it from the
 * parent again.
 */
export function withSetting(
  template: TemplateFile,
  path: readonly string[],
  value: unknown,
): TemplateFile {
  const own = value === '' ? null : value;
  return withValue(template as unknown as Settings, path, own) as unknown as TemplateFile;
}
