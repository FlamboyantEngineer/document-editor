// @vitest-environment node
// Generic template fixtures: hand-written templates that together set every setting of the
// template format, so a host's templates can be expressed in it. Each one must be valid, resolve
// over the base template with no setting missing, and give its scopes custom properties.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BASE_TEMPLATE,
  extensionRecord,
  missingTemplateSettings,
  resolveTemplateFile,
  type SettingShape,
  TEMPLATE_SHAPE,
  type TemplateFile,
  templateProperties,
  validateTemplateFile,
} from '../../../src/model/index.js';
import { documentSchema } from '../../document-markup.js';

const here = dirname(fileURLToPath(import.meta.url));

const fixtures = readdirSync(here)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => JSON.parse(readFileSync(join(here, file), 'utf8')) as TemplateFile);

const store = new Map<string, TemplateFile>([
  [BASE_TEMPLATE.id, BASE_TEMPLATE],
  ...fixtures.map((template): [string, TemplateFile] => [template.id, template]),
]);

const resolve = (template: TemplateFile) =>
  resolveTemplateFile(template, {
    loadTemplate: (id) => store.get(id),
    baseTemplateId: BASE_TEMPLATE.id,
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// A section's settings are counted as the template's of the same name, since they share a shape.
const normalized = (path: string) => path.replace(/^sections\[\]\.(?=.+\.)/, '');

// Each setting a shape holds, as a path with `[]` for list entries and `*` for record keys.
function shapePaths(shape: SettingShape, path: string): string[] {
  if (typeof shape === 'string' || 'oneOf' in shape) return [normalized(path)];
  if ('object' in shape) {
    return Object.entries(shape.object).flatMap(([key, entry]) =>
      shapePaths(entry, path ? `${path}.${key}` : key),
    );
  }
  if ('list' in shape) return shapePaths(shape.list, `${path}[]`);
  return shapePaths(shape.record, `${path}.*`);
}

// Each setting a template sets, by the same paths.
function setPaths(shape: SettingShape, value: unknown, path: string): string[] {
  if (value === null || value === undefined) return [];
  if (typeof shape === 'string' || 'oneOf' in shape) return [normalized(path)];
  if ('object' in shape) {
    if (!isRecord(value)) return [];
    return Object.entries(shape.object).flatMap(([key, entry]) =>
      setPaths(entry, value[key], path ? `${path}.${key}` : key),
    );
  }
  const entries = 'list' in shape ? (Array.isArray(value) ? value : []) : Object.values(value);
  const inner = 'list' in shape ? shape.list : shape.record;
  return entries.flatMap((entry) =>
    setPaths(inner, entry, `${path}${'list' in shape ? '[]' : '.*'}`),
  );
}

// The settings the base template leaves unset on purpose, each with why: it follows another
// setting, or it is a template's own choice with nothing to inherit.
const BASE_UNSET: readonly (readonly [RegExp, string])[] = [
  [/^parent$/, 'the base inherits nothing'],
  [/\.numbering\.enabled$/, 'unset, the format decides (DOCE-NUMBERING-2.6)'],
  [/\.caption\.(label|text)\./, 'a caption label follows its text, and its text the paragraph'],
  [/^styles\.(figure|codeBlock|equation)\.caption\.alignment$/, 'only table captions align'],
  [
    /^styles\.equation\.(caption\.(placement|continuedSuffix)|wrapper)$/,
    'equation numbers sit in `()`',
  ],
  [/^styles\.(title|heading[1-6]|codeBlock)\.lineHeight$/, 'follows the paragraph line height'],
  [/^styles\.codeBlock\.(weight|italic|underline|alignment)$/, 'code is set as written'],
  [/^styles\.paragraph\.indentation$/, 'paragraph levels place numbered paragraphs'],
  [/^styles\.list\.(prefix|suffix)$/, 'a list number has no affixes unless a template adds them'],
  [
    /^styles\.contents\.(title|entry)\.(font|size|italic|underline|color)$/,
    'follows the paragraph',
  ],
  [
    /^styles\.contents\.(padding\.(top|bottom)|spacing\.(left|right))$/,
    'lists of contents sit in the text column',
  ],
  [/^styles\.contents\.leader\.spacing$/, 'the leader character repeats without spacing'],
  [
    /^styles\.contents\.(levels\[\]|kinds\.\*)\./,
    "a level or kind follows the lists' own settings",
  ],
  [/^styles\.custom\.\*\./, 'a template names its own custom styles'],
  [
    /^(header|footer)\.(height|spacingToContent|inherit)$/,
    'a region is as tall as its content unless a template fixes it',
  ],
  [/^footnotes\.(marker|text)\.underline$/, 'footnotes are not underlined'],
  [/^footnotes\.text\.(spaceBefore|spaceAfter)$/, 'entries are spaced by the entry spacing'],
  [/^references\./, "reference formats and links are a template's own"],
];

describe('template fixtures', () => {
  it.each(fixtures)(
    'DOCE-TEMPLATES-10.8 $id is valid and resolves with every setting',
    (fixture) => {
      expect(validateTemplateFile(fixture, { schema: documentSchema })).toEqual([]);
      const resolved = resolve(fixture);
      expect(missingTemplateSettings(resolved)).toEqual([]);
      expect(templateProperties(resolved)['--doc-page-width']).toMatch(/px$/);
      for (const section of resolved.sections ?? []) {
        expect(templateProperties(resolved, { section })['--doc-page-height']).toMatch(/px$/);
      }
    },
  );

  it('DOCE-TEMPLATES-10.8 sets every setting of the template format between them', () => {
    const set = new Set(fixtures.flatMap((fixture) => setPaths(TEMPLATE_SHAPE, fixture, '')));
    const unset = [...new Set(shapePaths(TEMPLATE_SHAPE, ''))].filter((path) => !set.has(path));
    expect(unset).toEqual([]);
  });

  it('DOCE-TEMPLATES-10.8 inherits levels, kinds and extension entries through a chain', () => {
    const handbook = resolve(store.get('field-handbook') as TemplateFile);
    const paragraph = handbook.styles?.paragraph?.numbering;
    expect(paragraph?.enabled).toBe(false);
    expect(paragraph?.levels?.[1]).toMatchObject({ format: '1.a)', textIndent: '48pt' });
    expect(handbook.styles?.contents?.kinds?.figures?.customTitle).toBe('Figures');
    expect(handbook.styles?.contents?.kinds?.toc?.customTitle).toBe('Handbook contents');
    expect(Object.keys(extensionRecord(handbook, 'fields'))).toEqual(['site', 'edition']);
  });

  it('DOCE-TEMPLATES-2.4 gives every setting a base default, apart from a reviewed list', () => {
    const set = new Set(setPaths(TEMPLATE_SHAPE, BASE_TEMPLATE, ''));
    const unset = [...new Set(shapePaths(TEMPLATE_SHAPE, ''))].filter(
      (path) => !set.has(path) && !path.startsWith('sections[]') && !path.startsWith('extensions'),
    );
    expect(unset.filter((path) => !BASE_UNSET.some(([rule]) => rule.test(path)))).toEqual([]);
    // Every reviewed rule still names a setting the base leaves unset.
    expect(BASE_UNSET.filter(([rule]) => !unset.some((path) => rule.test(path)))).toEqual([]);
  });
});
