// Every section of the template editor as data, in the order it shows them below the text styles:
// page setup, paragraph numbering, header and footer, lists, the numbered objects, footnotes,
// contents, references and change bars.

import {
  PAGE_SIZE_DIMENSIONS,
  referenceFormatError,
  referenceFormatKeys,
} from '../../model/index.js';
import { FONT_PARTS, OBJECT_SECTIONS, RUNNING_PARTS } from './object-settings.js';
import {
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

// The lists of contents a document has, by their kind.
const CONTENTS_KINDS: [string, string][] = [
  ['toc', 'Table of contents'],
  ['figures', 'List of figures'],
  ['tables', 'List of tables'],
  ['codeBlocks', 'List of code'],
  ['equations', 'List of equations'],
  ['references', 'List of references'],
  ['abbreviations', 'List of abbreviations'],
];

// A contents leader: the character that fills the line to the page number, and its spacing.
const leader = (path: string): TemplateSetting[] => [
  setting(`${path}.character`, 'Leader', text),
  setting(`${path}.spacing`, 'Leader spacing', length),
];

// The contents' cards: title and entries, each level, then each kind with its own leaders.
const CONTENTS_CARDS: TemplateSettingCard[] = [
  { id: 'title', title: 'Title', path: ['title'], style: FONT_PARTS },
  { id: 'entry', title: 'Entries', path: ['entry'], style: FONT_PARTS },
  ...LEVELS.map((index) => ({
    id: `level-${String(index)}`,
    title: levelName(index),
    path: ['levels', String(index)],
    settings: [
      setting('indentation', 'Indentation', length),
      setting('spaceBefore', 'Space before', length),
      setting('spaceAfter', 'Space after', length),
      ...leader('leader'),
    ],
  })),
  ...CONTENTS_KINDS.map(([kind, title]) => ({
    id: `kind-${kind}`,
    title,
    path: ['kinds', kind],
    settings: [
      setting('title', 'Title', text),
      setting('leader.character', 'Leader', text),
      ...LEVELS.map((index) =>
        setting(`levels.${String(index)}.leader.character`, `${levelName(index)} leader`, text),
      ),
    ],
  })),
];

// What a reference's target is called, by its kind.
const TARGETS: Readonly<Record<string, string>> = {
  heading: 'headings',
  figure: 'figures',
  table: 'tables',
  codeblock: 'code blocks',
  equation: 'equations',
};

// What a reference format key reads as: its target, and the document it is in.
function referenceTitle(key: string): string {
  const [, internal] = /^internal-(.+)$/.exec(key) ?? [];
  if (internal) return `To ${TARGETS[internal] ?? internal}`;
  const external = Object.keys(TARGETS).find((kind) => key.endsWith(`-${kind}`));
  if (!external) return 'To other documents';
  return `To ${TARGETS[external] ?? external} in other documents`;
}

// Each reference format key's card: its format and whether it links to its target.
const REFERENCE_CARDS: TemplateSettingCard[] = referenceFormatKeys().map((key) => ({
  id: key,
  title: referenceTitle(key),
  path: [],
  settings: [
    {
      ...setting(`formats.${key}`, 'Format', text),
      hint: 'Such as Figure {{ref.numbering}}',
      check: (value) => (typeof value === 'string' ? referenceFormatError(value) : null),
    },
    setting(`links.${key}`, 'Links to the target', boolean),
  ],
}));

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
    scope: ['styles', 'paragraph', 'numbering'],
    settings: [
      setting('enabled', 'Number paragraphs', boolean),
      setting('prefix', 'Before the number', text),
      numberingSetting('format', 'Format'),
      setting('suffix', 'After the number', text),
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
      setting('prefix', 'Before the number', text),
      numberingSetting('format', 'Numbering format'),
      setting('suffix', 'After the number', text),
      setting('indentation', 'Indentation', length),
      setting('spaceBefore', 'Space before', length),
      setting('spaceAfter', 'Space after', length),
    ],
  },
  ...OBJECT_SECTIONS,
  {
    id: 'footnotes',
    title: 'Footnotes',
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
  {
    id: 'contents',
    title: 'Contents',
    scope: ['styles', 'contents'],
    documentOnly: true,
    settings: [
      ...leader('leader'),
      setting('padding', 'Padding', { type: 'sides', unit: 'pt', side: 'padding' }),
      setting('spacing', 'Spacing', { type: 'sides', unit: 'pt', side: 'spacing' }),
    ],
    cards: CONTENTS_CARDS,
  },
  {
    id: 'references',
    title: 'References',
    scope: ['references'],
    documentOnly: true,
    settings: [],
    cards: REFERENCE_CARDS,
  },
  {
    id: 'change-bars',
    title: 'Change bars',
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
