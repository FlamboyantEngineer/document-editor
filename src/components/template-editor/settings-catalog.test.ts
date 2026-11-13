import { describe, expect, it } from 'vitest';
import { type SettingShape, TEMPLATE_SHAPE } from '../../model/index.js';
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
    'color',
    'alignment',
    'spaceBefore',
    'spaceAfter',
    'lineHeight',
    ...(style.startsWith('heading')
      ? ['numbering.enabled', 'numbering.format', 'numbering.prefix', 'numbering.suffix']
      : []),
    ...(style === 'paragraph' ? ['indentation'] : []),
  ].map((key) => `styles.${style}.${key}`),
);

const NUMBERING = ['enabled', 'format', 'prefix', 'suffix'];
const SIDES = ['top', 'right', 'bottom', 'left'];

// The paths a setting's row writes.
const settingPaths = (base: string[], setting: TemplateSetting): string[][] =>
  setting.kind.type === 'sides'
    ? SIDES.map((side) => [...base, ...setting.path, side])
    : [[...base, ...setting.path]];

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
    const rows = new Set([
      ...STYLE_ROWS,
      ...TEMPLATE_SECTIONS.flatMap((section) => [
        ...section.settings.flatMap((each) => settingPaths([...section.scope], each)),
        ...(section.cards ?? []).flatMap((card) => cardPaths(section.scope, card)),
      ]).map(asShapePath),
    ]);
    const missing = shapePaths(TEMPLATE_SHAPE).filter(
      (path) => !ELSEWHERE.test(path) && !rows.has(path),
    );
    expect(missing).toEqual([]);
  });

  it('DOCE-TEMPLATE-EDITOR-1.3 leaves what only the document sets out of a section', () => {
    const documentOnly = TEMPLATE_SECTIONS.filter((section) => section.documentOnly).map(
      (section) => section.id,
    );
    expect(documentOnly).toEqual(['contents', 'references']);
  });
});
