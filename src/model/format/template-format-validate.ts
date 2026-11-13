// Whether a stored template is valid: every setting is one the format knows, with a value of its
// kind, and the template's identity, references and sections are consistent. A template's content,
// such as a header, is checked against the schema when one is given.

import type { ContentMatch, Schema } from 'prosemirror-model';
import { referenceFormatError, referenceFormatKeys } from '../reference-format.js';
import { templateImageErrors } from '../templates/template-content.js';
import { DOCUMENT_FORMAT_VERSION, STORED_NODE_TYPES } from './document-format.js';
import { readDocumentFile, readStoredContent } from './document-format-convert.js';
import { TEMPLATE_FORMAT_VERSION, type TemplateFile } from './template-format.js';
import { type SettingShape, TEMPLATE_SHAPE } from './template-format-shape.js';

type LooseRecord = Record<string, unknown>;

const LENGTH = /^-?\d+(?:\.\d+)?(?:px|pt|mm|cm|in|em|rem|%)$/;
const COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const TEMPLATE_ID = /^[A-Za-z0-9_-]+$/;
const SECTION_NAME = /^[a-z0-9_]+$/;
const NAME_MAX_LENGTH = 120;
// One to six levels, each a counter character and the separators after it.
const NUMBERING_FORMAT = /^(?:[1aAiI][.\-:_/ )]*){0,6}$/;
const BULLET_KEYWORDS: readonly string[] = ['disc', 'circle', 'square', 'none'];
const BULLET_MAX_LENGTH = 8;
// Control characters, line and paragraph separators, and bidi and zero-width formatting.
const NAME_DISALLOWED =
  // eslint-disable-next-line no-control-regex -- matches control characters on purpose
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060\ufeff]/;

/** What a template is validated against. */
export interface TemplateValidationOptions {
  /** The host's own external reference types (DOCE-SCHEMA-4.1). */
  referenceTypes?: readonly string[] | undefined;
  /** The schema a template's content is read with; without one, content is not checked. */
  schema?: Schema | undefined;
}

interface Walk {
  path: string;
  errors: string[];
  schema: Schema | undefined;
}

const at = (walk: Walk, path: string): Walk => ({ ...walk, path });

function isRecord(value: unknown): value is LooseRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Whether a value is a CSS length with its unit. */
export function isTemplateLength(value: unknown): boolean {
  return typeof value === 'string' && LENGTH.test(value);
}

/**
 * Whether a value is a numbering format: up to six levels, each `1`, `a`, `A`, `i` or `I` and the
 * separators after it (`.`, `-`, `:`, `_`, `/`, `)` and space). Empty numbers nothing.
 */
export function isNumberingFormat(value: unknown): boolean {
  return typeof value === 'string' && NUMBERING_FORMAT.test(value);
}

/** Whether a bullet is a marker keyword (`BulletKeyword`) rather than the text it shows. */
export function isBulletKeyword(value: unknown): boolean {
  return typeof value === 'string' && BULLET_KEYWORDS.includes(value);
}

/** Whether a value is a bullet: a marker keyword, or up to 8 characters of plain text. */
export function isTemplateBullet(value: unknown): boolean {
  if (isBulletKeyword(value)) return true;
  return (
    typeof value === 'string' &&
    value.trim() !== '' &&
    [...value].length <= BULLET_MAX_LENGTH &&
    !NAME_DISALLOWED.test(value)
  );
}

/** What a custom style's name may be: a letter, then letters, digits, `_` or `-`, 16 at most. */
export const CUSTOM_STYLE_NAME = /^[a-z][a-z0-9_-]{0,15}$/i;

/** Whether a value is a hex color. */
export function isTemplateColor(value: unknown): boolean {
  return typeof value === 'string' && COLOR.test(value);
}

/** Whether a value is a line height: a positive multiple of the font size. */
export function isTemplateLineHeight(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Whether a value is a font weight: a whole number from 1 to 1000. */
export function isTemplateWeight(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1000;
}

const LEAF_CHECKS: Readonly<Record<string, [(value: unknown) => boolean, string]>> = {
  length: [isTemplateLength, 'must be a length with a unit, such as 12pt'],
  color: [isTemplateColor, 'must be a hex color'],
  text: [(value) => typeof value === 'string', 'must be text'],
  boolean: [(value) => typeof value === 'boolean', 'must be true or false'],
  lineHeight: [isTemplateLineHeight, 'must be a positive number'],
  numbering: [
    isNumberingFormat,
    'must be a numbering format: up to six of 1, a, A, i or I, each with its separators',
  ],
  bullet: [isTemplateBullet, 'must be disc, circle, square, none or up to 8 characters of text'],
  weight: [isTemplateWeight, 'must be a font weight from 1 to 1000'],
  any: [() => true, ''],
};

// The first node of a region's content that a page header or footer does not allow, such as a
// column layout, which only a section's content holds; null when the region can hold them all.
function unheldByRegion(content: readonly unknown[], schema: Schema): string | null {
  let match: ContentMatch | null | undefined = schema.nodes.page_header?.contentMatch;
  for (const [index, node] of readStoredContent(content, schema).entries()) {
    match = match?.matchType(node.type);
    if (match === null) {
      const name = STORED_NODE_TYPES[node.type.name]?.type ?? node.type.name;
      return `[${String(index)}]: a page header or footer does not allow ${name}`;
    }
  }
  return null;
}

function checkContent(value: unknown, walk: Walk, region = false): void {
  const { path } = walk;
  if (!Array.isArray(value)) {
    walk.errors.push(`${path} must be a list of content`);
    return;
  }
  if (!walk.schema) return;
  try {
    readDocumentFile(
      { formatVersion: DOCUMENT_FORMAT_VERSION, sections: [{ content: value }] },
      walk.schema,
    );
    const unheld = region ? unheldByRegion(value, walk.schema) : null;
    if (unheld) walk.errors.push(`${path}: ${unheld}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'is not valid content';
    walk.errors.push(`${path}: ${message.replace(/^sections\[0\]\.content/, '')}`);
  }
}

function checkObject(fields: Readonly<Record<string, SettingShape>>, value: unknown, walk: Walk) {
  const { path } = walk;
  if (!isRecord(value)) {
    walk.errors.push(`${path} must be an object`);
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    const shape = fields[key];
    if (shape) checkValue(shape, entry, at(walk, `${path}.${key}`));
    else walk.errors.push(`${path}.${key} is not a template setting`);
  }
}

function checkValue(shape: SettingShape, value: unknown, walk: Walk): void {
  if (value === null || value === undefined) return;
  const { path } = walk;
  if (typeof shape === 'string') {
    if (shape === 'content' || shape === 'regionContent') {
      checkContent(value, walk, shape === 'regionContent');
      return;
    }
    const [check, message] = LEAF_CHECKS[shape] ?? [() => true, ''];
    if (!check(value)) walk.errors.push(`${path} ${message}`);
    return;
  }
  if ('oneOf' in shape) {
    if (!shape.oneOf.includes(value as string)) {
      walk.errors.push(`${path} must be one of ${shape.oneOf.join(', ')}`);
    }
  } else if ('object' in shape) {
    checkObject(shape.object, value, walk);
  } else if ('list' in shape) {
    if (!Array.isArray(value)) walk.errors.push(`${path} must be a list`);
    else
      value.forEach((entry, index) => {
        checkValue(shape.list, entry, at(walk, `${path}[${String(index)}]`));
      });
  } else if (!isRecord(value)) {
    walk.errors.push(`${path} must be an object`);
  } else {
    for (const [key, entry] of Object.entries(value))
      checkValue(shape.record, entry, at(walk, `${path}.${key}`));
  }
}

function identityErrors(template: LooseRecord): string[] {
  const errors: string[] = [];
  if (typeof template.id !== 'string' || !TEMPLATE_ID.test(template.id)) {
    errors.push('template.id must use letters, digits, underscores or hyphens');
  }
  const name = template.name;
  if (typeof name === 'string' && name.length > NAME_MAX_LENGTH) {
    errors.push(`template.name must be at most ${String(NAME_MAX_LENGTH)} characters`);
  } else if (typeof name === 'string' && NAME_DISALLOWED.test(name)) {
    errors.push('template.name must not contain control or formatting characters');
  }
  if (typeof template.parent === 'string' && template.parent === template.id) {
    errors.push('template.parent must not be the template itself');
  }
  return errors;
}

function referenceErrors(template: LooseRecord, referenceTypes: readonly string[] = []): string[] {
  const references = isRecord(template.references) ? template.references : {};
  const keys = new Set(referenceFormatKeys(referenceTypes));
  const errors: string[] = [];
  for (const group of ['formats', 'links']) {
    const settings = isRecord(references[group]) ? (references[group] as LooseRecord) : {};
    for (const [key, value] of Object.entries(settings)) {
      if (!keys.has(key))
        errors.push(`template.references.${group}.${key} is not a reference type`);
      const error =
        group === 'formats' && typeof value === 'string' ? referenceFormatError(value) : null;
      if (error) errors.push(`template.references.formats.${key}: ${error}`);
    }
  }
  return errors;
}

// The names of the custom styles of a scope's styles.
function customStyleErrors(styles: unknown, at: string): string[] {
  const custom = isRecord(styles) && isRecord(styles.custom) ? styles.custom : {};
  return Object.keys(custom)
    .filter((name) => !CUSTOM_STYLE_NAME.test(name))
    .map(
      (name) =>
        `${at}.styles.custom.${name} must be named with a letter, then letters, digits, underscores or hyphens, 16 at most`,
    );
}

function sectionErrors(template: LooseRecord): string[] {
  const sections = Array.isArray(template.sections) ? template.sections : [];
  const names = new Set<string>();
  const errors: string[] = [];
  sections.forEach((section: unknown, index) => {
    const at = `template.sections[${String(index)}]`;
    const name = isRecord(section) ? section.name : undefined;
    if (typeof name !== 'string' || !SECTION_NAME.test(name)) {
      errors.push(`${at}.name must use lower-case letters, digits or underscores`);
    } else if (names.has(name)) {
      errors.push(`${at}.name is used by another section`);
    } else {
      names.add(name);
    }
    if (isRecord(section)) errors.push(...customStyleErrors(section.styles, at));
  });
  return errors;
}

/** The errors of a stored template, each naming its setting; none when it is valid. */
export function validateTemplateFile(
  template: unknown,
  options: TemplateValidationOptions = {},
): string[] {
  if (!isRecord(template)) return ['template must be an object'];
  if (template.formatVersion !== TEMPLATE_FORMAT_VERSION) {
    return [`template.formatVersion must be ${String(TEMPLATE_FORMAT_VERSION)}`];
  }
  const walk: Walk = { path: 'template', errors: [], schema: options.schema };
  const { formatVersion: _version, ...settings } = template;
  checkValue(TEMPLATE_SHAPE, settings, walk);
  return [
    ...identityErrors(template),
    ...walk.errors,
    ...referenceErrors(template, options.referenceTypes),
    ...customStyleErrors(template.styles, 'template'),
    // Images are looked for only in content of the right shape, which the walk has checked.
    ...(walk.errors.length ? [] : templateImageErrors(template as unknown as TemplateFile)),
    ...sectionErrors(template),
  ];
}
