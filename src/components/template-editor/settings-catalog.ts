// Every section of the template editor as data, in the order it shows them below the text styles:
// page setup, paragraph numbering, header and footer, lists, the numbered objects, footnotes,
// contents, references and change bars.

import {
  EXTERNAL_DOCUMENT_REFERENCE_TYPE,
  PAGE_SIZE_DIMENSIONS,
  referenceFormatError,
  referenceFormatKeys,
} from '../../model/index.js';
import { contentsSettings } from './contents-catalog.js';
import { FONT_PARTS, OBJECT_SECTIONS, RUNNING_PARTS } from './object-settings.js';
import {
  affixSetting,
  choice,
  numberingSetting,
  PAGE_SIZES,
  select,
  setting,
  type TemplateSetting,
  type TemplateSettingCard,
  type TemplateSettingSection,
} from './template-settings.js';

const text = { type: 'text' } as const;
const length = { type: 'length' } as const;
const color = { type: 'color' } as const;
const boolean = { type: 'boolean' } as const;
const LEVELS = [0, 1, 2, 3, 4, 5];
const levelName = (index: number) => `Level ${String(index + 1)}`;

// A page size with its dimensions, such as `A4 (210 × 297 mm)`.
function pageSizeLabel(size: string): string {
  const found = PAGE_SIZE_DIMENSIONS[size];
  if (!found) return size;
  const unit = found.width.replace(/[\d.]/g, '');
  const across = found.width.replace(unit, '');
  const down = found.height.replace(unit, '');
  return `${size} (${across} × ${down} ${unit})`;
}

/** The bullets a bulleted list may show. */
const BULLETS: [string, string][] = [
  ['disc', '• Disc'],
  ['circle', '◦ Circle'],
  ['square', '▪ Square'],
  ['–', '– Dash'],
  ['none', 'None'],
];

// A region's settings: its height, its space to the content, and whether it takes its parent's.
const region = (key: 'header' | 'footer', label: string, space: string): TemplateSetting[] => [
  {
    ...setting(`${key}.inherit`, `${label} inherits`, boolean),
    hint: `Takes the ${key} of the parent template, or of the document for a section`,
  },
  setting(`${key}.height`, `${label} height`, length),
  setting(`${key}.spacingToContent`, space, length),
];

// The cards of the paragraph numbering's six levels.
const PARAGRAPH_LEVELS: TemplateSettingCard[] = LEVELS.map((index) => ({
  id: `level-${String(index)}`,
  title: levelName(index),
  path: ['levels', String(index)],
  settings: [
    numberingSetting('format', 'Format'),
    setting('numberIndent', 'Number indent', length),
    setting('textIndent', 'Text indent', length),
  ],
}));

// What a reference's target is called, by its kind.
const TARGETS: Readonly<Record<string, string>> = {
  heading: 'headings',
  figure: 'figures',
  table: 'tables',
  codeblock: 'code blocks',
  equation: 'equations',
};

/** A host's reference type besides other documents, with what its targets are in. */
export interface TemplateReferenceType {
  /** The type references record, as the schema knows it (`referenceTypes`). */
  readonly type: string;
  /** What its targets are in, after `in`, such as `the catalog`. */
  readonly label: string;
}

const OTHER_DOCUMENTS: TemplateReferenceType = {
  type: EXTERNAL_DOCUMENT_REFERENCE_TYPE,
  label: 'other documents',
};

// What a reference format key reads as: its target, and where it is.
function referenceTitle(key: string, types: readonly TemplateReferenceType[]): string {
  const [, internal] = /^internal-(.+)$/.exec(key) ?? [];
  if (internal) return `To ${TARGETS[internal] ?? internal}`;
  const { type, label } =
    [...types]
      .sort((one, other) => other.type.length - one.type.length)
      .find((entry) => key === entry.type || key.startsWith(`${entry.type}-`)) ?? OTHER_DOCUMENTS;
  const kind = key.slice(type.length + 1);
  return kind ? `To ${TARGETS[kind] ?? kind} in ${label}` : `To ${label}`;
}

// What a reference format may use, said under the first format.
const REFERENCE_TOKENS =
  'Uses {{ref.numbering}}, {{ref.title}}, {{ref.revision}}, {{doc.numbering}} and {{doc.title}}; left empty, it inherits';

/**
 * The references section for the host's reference types besides other documents (DOCUMENT-FORMAT
 * reference types): the format of each kind of reference, then whether each links to its target.
 */
export function referenceSection(
  types: readonly TemplateReferenceType[] = [],
): TemplateSettingSection {
  const all = [OTHER_DOCUMENTS, ...types];
  const keys = referenceFormatKeys(types.map(({ type }) => type));
  return {
    id: 'references',
    title: 'References',
    scope: ['references'],
    documentOnly: true,
    pagesOnly: true,
    settings: [],
    cards: [
      {
        id: 'formats',
        title: 'Format',
        path: ['formats'],
        settings: keys.map((key, index) => ({
          ...setting(key, referenceTitle(key, all), text),
          ...(index === 0 ? { hint: REFERENCE_TOKENS } : {}),
          check: (value: unknown) =>
            typeof value === 'string' ? referenceFormatError(value) : null,
        })),
      },
      {
        id: 'links',
        title: 'Links to the target',
        path: ['links'],
        settings: keys.map((key) => setting(key, referenceTitle(key, all), boolean)),
      },
    ],
  };
}

const CHANGE_KINDS = ['insertions', 'deletions', 'modifications', 'formatting'] as const;

/** The editor's sections, in order, below the text styles. */
export const TEMPLATE_SECTIONS: readonly TemplateSettingSection[] = [
  {
    id: 'page',
    title: 'Page setup',
    scope: ['page'],
    settings: [
      {
        ...setting(
          'size',
          'Page size',
          select(...PAGE_SIZES.map((size): [string, string] => [size, pageSizeLabel(size)])),
        ),
        pagesOnly: true,
      },
      {
        ...setting(
          'orientation',
          'Orientation',
          choice(['portrait', 'Portrait'], ['landscape', 'Landscape']),
        ),
        pagesOnly: true,
      },
      setting('margins', 'Margins', { type: 'sides', unit: 'page', side: 'margin' }),
    ],
  },
  {
    id: 'paragraph-numbering',
    title: 'Paragraph numbering',
    pagesOnly: true,
    scope: ['styles', 'paragraph', 'numbering'],
    settings: [
      setting('enabled', 'Number paragraphs', boolean),
      affixSetting('prefix', 'Before the number', 'prefix'),
      numberingSetting('format', 'Format'),
      affixSetting('suffix', 'After the number', 'suffix'),
    ],
    cards: PARAGRAPH_LEVELS,
  },
  {
    id: 'regions',
    title: 'Header & footer',
    scope: [],
    pagesOnly: true,
    settings: [
      ...region('header', 'Header', 'Space below the header'),
      ...region('footer', 'Footer', 'Space above the footer'),
    ],
  },
  {
    id: 'lists',
    title: 'Lists',
    scope: ['styles', 'list'],
    settings: [
      setting('bullet', 'Bullet', select(...BULLETS)),
      affixSetting('prefix', 'Before the number', 'prefix'),
      numberingSetting('format', 'Numbering format'),
      affixSetting('suffix', 'After the number', 'suffix'),
      setting('indentation', 'Indentation', length),
      setting('spaceBefore', 'Space before', length),
      setting('spaceAfter', 'Space after', length),
    ],
  },
  ...OBJECT_SECTIONS,
  {
    id: 'footnotes',
    title: 'Footnotes',
    pagesOnly: true,
    scope: ['footnotes'],
    settings: [
      {
        ...setting(
          'numbering',
          'Numbering',
          select(['document', 'Through the document'], ['page', 'On each page']),
        ),
        documentOnly: true,
      },
      setting('suffix', 'After the number', text),
      setting('separator.enabled', 'Separator line', boolean),
      setting('separator.thickness', 'Separator thickness', length),
      setting('separator.color', 'Separator colour', color),
      setting('spacingToContent', 'Space above', length),
      setting('entrySpacing', 'Space between notes', length),
    ],
    cards: [
      { id: 'marker', title: 'Marker', path: ['marker'], style: FONT_PARTS },
      { id: 'text', title: 'Text', path: ['text'], style: RUNNING_PARTS },
    ],
  },
  contentsSettings(null),
  referenceSection(),
  {
    id: 'change-bars',
    title: 'Change bars',
    pagesOnly: true,
    scope: ['changeBars'],
    settings: [
      ...CHANGE_KINDS.flatMap((kind) => {
        const label = `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
        return [
          setting(`${kind}.enabled`, `Show ${kind}`, boolean),
          setting(`${kind}.color`, label, color),
        ];
      }),
      setting('side', 'Side', choice(['left', 'Left'], ['right', 'Right'])),
      setting('offset', 'Offset', length),
      setting('width', 'Width', length),
    ],
  },
];
