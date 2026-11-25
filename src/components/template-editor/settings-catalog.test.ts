import { describe, expect, it } from 'vitest';
import { type SettingShape, TEMPLATE_SHAPE } from '../../model/index.js';
import { CONTENTS_KINDS, contentsSettings } from './contents-catalog.js';
import { TEMPLATE_SECTIONS } from './settings-catalog.js';
import { styleKeys } from './style-rows.js';
import type { TemplateSetting, TemplateSettingCard } from './template-settings.js';

// Every path the template format knows, below the template, with `#` for a list's index and `*`
// for a record's key.
function shapePaths(shape: SettingShape, path: string[] = []): string[] {
  if (typeof shape === 'string') return [path.join('.')];
  if ('object' in shape)
    return Object.entries(shape.object).flatMap(([key, child]) =>
      shapePaths(child, [...path, key]),
    );
  if ('list' in shape) return shapePaths(shape.list, [...path, '#']);
  if ('record' in shape) return shapePaths(shape.record, [...path, '*']);
  return [path.join('.')];
}

// What the format leaves to other parts of the editor: the identity, the content of regions and
// sections, the sections themselves and the host's extensions.
const ELSEWHERE = /^(formatVersion|id|name|parent|sections|extensions)\b|\.content$/;

// What the format holds that the editor offers no row for, set in the template's file only: the
// title's and headings' own line height, a custom style's colour, and a footnote's numbering mode,
// text after the number, colours, underline and text spacing.
const NOT_IN_EDITOR = [
  /^styles\.(title|heading[1-6])\.lineHeight$/,
  /^styles\.custom\.\*\.color$/,
  /^footnotes\.(numbering|suffix|separator\.color)$/,
  /^footnotes\.(marker|text)\.(underline|color)$/,
  /^footnotes\.text\.(spaceBefore|spaceAfter)$/,
];

// The text styles' cards and the custom styles' rows, which are not in the sections' data.
const STYLE_ROWS = [
  'title',
  ...[1, 2, 3, 4, 5, 6].map((level) => `heading${String(level)}`),
  'paragraph',
  'custom.*',
].flatMap((style) =>
  [
    'font',
    'size',
    'weight',
    'italic',
    'underline',
    ...(style === 'custom.*' ? [] : ['color']),
    'alignment',
    'spaceBefore',
    'spaceAfter',
    ...(style === 'paragraph' || style === 'custom.*' ? ['lineHeight'] : []),
    ...(style.startsWith('heading')
      ? ['numbering.enabled', 'numbering.format', 'numbering.prefix', 'numbering.suffix']
      : []),
    ...(style === 'paragraph' ? ['indentation'] : []),
  ].map((key) => `styles.${style}.${key}`),
);

const NUMBERING = ['enabled', 'format', 'prefix', 'suffix'];
const SIDES = ['top', 'right', 'bottom', 'left'];

// The paths a setting's row writes.
const settingPaths = (base: string[], setting: TemplateSetting): string[][] => {
  const { kind } = setting;
  if (kind.type === 'sides') return SIDES.map((side) => [...base, ...setting.path, side]);
  if (kind.type === 'strip')
    return kind.cells.flatMap((each) => settingPaths([...base, ...setting.path], each));
  return [[...base, ...setting.path]];
};

// The paths a card's rows write.
const cardPaths = (scope: readonly string[], card: TemplateSettingCard): string[][] => {
  const base = [...scope, ...card.path];
  const style = styleKeys(card.style ?? []).flatMap((key) =>
    key[0] === 'numbering'
      ? NUMBERING.map((each) => [...base, 'numbering', each])
      : [[...base, ...key]],
  );
  return [...style, ...(card.settings ?? []).flatMap((each) => settingPaths(base, each))];
};

// The editor's paths in the format's terms: an index as `#`, a kind or a format key as `*`.
const asShapePath = (path: string[]) =>
  path
    .map((key, index) =>
      /^\d+$/.test(key)
        ? '#'
        : ['kinds', 'formats', 'links'].includes(path[index - 1] ?? '')
          ? '*'
          : key,
    )
    .join('.');

describe('TEMPLATE_SECTIONS', () => {
  it('DOCE-TEMPLATE-EDITOR-1.9 has a row for every setting of the template format', () => {
    // The contents section shows every list's settings or one kind's, and one level's at a time.
    const contents = [null, ...CONTENTS_KINDS.map(([kind]) => kind)].flatMap((kind) =>
      [0, 1, 2, 3, 4, 5].map((level) => contentsSettings(kind, level)),
    );
    const rows = new Set([
      ...STYLE_ROWS,
      ...[...TEMPLATE_SECTIONS, ...contents]
        .flatMap((section) => [
          ...section.settings.flatMap((each) => settingPaths([...section.scope], each)),
          ...(section.cards ?? []).flatMap((card) => cardPaths(section.scope, card)),
        ])
        .map(asShapePath),
    ]);
    const offered = (path: string) => !NOT_IN_EDITOR.some((rule) => rule.test(path));
    const missing = shapePaths(TEMPLATE_SHAPE).filter(
      (path) => !ELSEWHERE.test(path) && offered(path) && !rows.has(path),
    );
    expect(missing).toEqual([]);
    // And no row for what it leaves out.
    expect([...rows].filter((path) => !offered(path))).toEqual([]);
  });

  it('DOCE-TEMPLATE-EDITOR-1.9 orders the sections from the page setup to the change bars', () => {
    expect(TEMPLATE_SECTIONS.map((section) => section.title)).toEqual([
      'Page setup',
      'Paragraph numbering',
      'Header & footer',
      'References',
      'Lists',
      'Tables',
      'Figures',
      'Code blocks',
      'Equations',
      'Block spacing',
      'Footnotes',
      'Contents',
      'Change bars',
    ]);
  });

  it('DOCE-TEMPLATE-EDITOR-1.3 leaves what only the document sets out of a section', () => {
    const documentOnly = TEMPLATE_SECTIONS.filter((section) => section.documentOnly).map(
      (section) => section.id,
    );
    expect(documentOnly).toEqual(['references', 'contents']);
  });
});
