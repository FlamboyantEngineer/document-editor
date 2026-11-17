// The settings of a template's numbered objects as data: tables, figures, code blocks and
// equations, each with its numbering, its caption and the caption's label and text typography.

import {
  choice,
  select,
  setting,
  type StylePart,
  type TemplateSettingCard,
  type TemplateSettingSection,
} from './template-settings.js';

/** A font's rows: its font and size, its weight, slant and underline, and its colour. */
export const FONT_PARTS: readonly StylePart[] = ['font', 'face', 'colour'];

/** Running text's rows: a font's, with its alignment, justified too, spacing and line height. */
export const RUNNING_PARTS: readonly StylePart[] = [
  'font',
  'face',
  'justify',
  'colour',
  'spacing',
  'lineHeight',
];

const length = { type: 'length' } as const;
const color = { type: 'color' } as const;
const boolean = { type: 'boolean' } as const;
const placement = select(['above', 'Above'], ['below', 'Below']);

/** A numbered object's cards: its numbering and caption, then its caption's label and text inline. */
const CAPTIONED: readonly TemplateSettingCard[] = [
  { id: 'numbering', title: 'Numbering', path: [], style: ['numbering'] },
  {
    id: 'caption',
    title: 'Caption',
    path: ['caption'],
    settings: [
      setting('placement', 'Placement', placement),
      setting(
        'alignment',
        'Alignment',
        choice(['left', 'Left'], ['center', 'Centre'], ['right', 'Right']),
      ),
      {
        ...setting('continuedSuffix', 'After a continued caption', { type: 'text' }),
        hint: 'Such as (continued)',
      },
    ],
  },
  // The caption's label and text sit under their headings in the section.
  {
    id: 'caption-label',
    title: 'Caption label',
    path: ['caption', 'label'],
    style: FONT_PARTS,
    inline: true,
  },
  {
    id: 'caption-text',
    title: 'Caption text',
    path: ['caption', 'text'],
    style: FONT_PARTS,
    inline: true,
  },
];

/** The sections of the numbered objects, in the order the editor shows them. */
export const OBJECT_SECTIONS: readonly TemplateSettingSection[] = [
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
      setting('header.weight', 'Header weight', { type: 'number', min: 100, max: 900, step: 100 }),
      setting('rows.odd', 'Odd rows', color),
      setting('rows.even', 'Even rows', color),
      setting('repeatHeader', 'Repeat the header on each page', boolean),
    ],
    cards: CAPTIONED,
  },
  {
    id: 'figures',
    title: 'Figures',
    scope: ['styles', 'figure'],
    settings: [setting('defaultWidth', 'Default width', length)],
    cards: CAPTIONED,
  },
  {
    id: 'code',
    title: 'Code blocks',
    scope: ['styles', 'codeBlock'],
    settings: [setting('background', 'Background', color)],
    cards: [
      { id: 'text', title: 'Text', path: [], style: RUNNING_PARTS, code: true },
      ...CAPTIONED,
    ],
  },
  {
    id: 'equations',
    title: 'Equations',
    scope: ['styles', 'equation'],
    settings: [
      {
        ...setting('wrapper', 'Brackets around the number', { type: 'text' }),
        hint: 'Such as ()',
      },
    ],
    cards: CAPTIONED,
  },
];
