// Sets a template's settings in the template editor field by field, as a writer does: each setting
// of a template becomes a step that names the editor's section, card and field for it and the
// value to give it, read from the editor's own list of settings (`TEMPLATE_SECTIONS`).

import { expect, type Locator } from '@playwright/test';
import {
  CONTENTS_KINDS,
  contentsSettings,
} from '../src/components/template-editor/contents-catalog.js';
import { TEMPLATE_SECTIONS } from '../src/components/template-editor/settings-catalog.js';
import type {
  SettingKind,
  StylePart,
  TemplateSetting,
  TemplateSettingSection,
} from '../src/components/template-editor/template-settings.js';

type FieldKind =
  'text' | 'points' | 'number' | 'color' | 'combobox' | 'check' | 'toggle' | 'segment' | 'select';

/** One setting to set: where its field is, what kind it is, and the value. */
export interface SettingStep {
  readonly path: readonly string[];
  readonly section: string;
  readonly card?: string;
  readonly label: string;
  readonly kind: FieldKind;
  readonly value: unknown;
  /** What its section shows first, such as the list type and heading level of the contents. */
  readonly picks?: readonly Pick[];
}

/** A choice a section's picker makes before a setting's field shows: the picker and its option. */
export interface Pick {
  readonly label: string;
  readonly option: string;
}

type Field = Omit<SettingStep, 'path' | 'section' | 'card' | 'value'> & { value: unknown };

const TEXT_STYLE_CARDS: Readonly<Record<string, string>> = {
  title: 'Title',
  ...Object.fromEntries(
    [1, 2, 3, 4, 5, 6].map((level) => [`heading${String(level)}`, `Heading ${String(level)}`]),
  ),
  paragraph: 'Paragraph',
};

const ALIGNMENTS: Readonly<Record<string, string>> = {
  left: 'Left',
  center: 'Centre',
  right: 'Right',
  justify: 'Justify',
};

const SIDES: Readonly<Record<string, string>> = {
  top: 'Top',
  right: 'Right',
  bottom: 'Bottom',
  left: 'Left',
};

// The field of a style's part, by its key below the style.
function styleField(key: string, value: unknown): Field | null {
  const fields: Readonly<Record<string, Field>> = {
    font: { label: 'Font', kind: 'select', value },
    size: { label: 'Size', kind: 'points', value },
    weight: { label: 'Bold', kind: 'toggle', value: Number(value) >= 600 },
    italic: { label: 'Italic', kind: 'toggle', value },
    underline: { label: 'Underline', kind: 'toggle', value },
    color: { label: 'Colour', kind: 'color', value },
    alignment: { label: ALIGNMENTS[String(value)] ?? '', kind: 'segment', value },
    spaceBefore: { label: 'Space before', kind: 'points', value },
    spaceAfter: { label: 'Space after', kind: 'points', value },
    lineHeight: { label: 'Line height', kind: 'number', value },
    indentation: { label: 'Indentation', kind: 'text', value },
    'numbering.enabled': { label: 'Numbered', kind: 'check', value },
    'numbering.prefix': { label: 'Before the number', kind: 'text', value },
    'numbering.format': { label: 'Numbering', kind: 'combobox', value },
    'numbering.suffix': { label: 'After the number', kind: 'text', value },
  };
  return fields[key] ?? null;
}

// The field of a setting of a kind.
function settingField(setting: TemplateSetting, value: unknown): Field {
  const kind: SettingKind = setting.kind;
  const option = (options: readonly { id: string; label: string }[]) =>
    options.find((each) => each.id === value)?.label ?? String(value);
  switch (kind.type) {
    case 'select':
      return { label: setting.label, kind: 'select', value: option(kind.options) };
    case 'choice':
      return { label: option(kind.options), kind: 'segment', value };
    case 'boolean':
      return { label: setting.label, kind: 'check', value };
    case 'number':
    case 'points':
    case 'color':
      return { label: setting.label, kind: kind.type, value };
    case 'font':
      return { label: setting.label, kind: 'select', value };
    case 'numbering':
      return { label: setting.label, kind: 'combobox', value };
    default:
      return { label: setting.label, kind: 'text', value };
  }
}

// The field of a setting below a section or card, by its path there.
function findSetting(
  settings: readonly TemplateSetting[],
  rest: readonly string[],
  value: unknown,
): Field | null {
  const key = rest.join('.');
  for (const setting of settings) {
    const at = setting.path.join('.');
    if (at === key) return settingField(setting, value);
    if (setting.kind.type === 'sides' && rest.length === setting.path.length + 1)
      if (key.startsWith(`${at}.`)) {
        const side = SIDES[rest.at(-1) ?? ''] ?? '';
        return { label: `${side} ${setting.kind.side}`, kind: 'number', value };
      }
  }
  return null;
}

// The part of a style's rows that sets a key below the style.
const PART_OF: Readonly<Record<string, readonly StylePart[]>> = {
  font: ['font'],
  size: ['font', 'size'],
  weight: ['face', 'emphasis'],
  italic: ['face', 'emphasis'],
  underline: ['face'],
  color: ['colour'],
  alignment: ['align', 'justify'],
  spaceBefore: ['spacing'],
  spaceAfter: ['spacing'],
  lineHeight: ['lineHeight'],
  numbering: ['numbering'],
};

// The field of a style's part a card has, by its key below the card.
const cardStyleField = (parts: readonly StylePart[], rest: readonly string[], value: unknown) =>
  PART_OF[rest[0] ?? '']?.some((part) => parts.includes(part))
    ? styleField(rest.join('.'), value)
    : null;

const startsWith = (path: readonly string[], prefix: readonly string[]) =>
  prefix.every((key, index) => path[index] === key);

// The step that sets a setting below a section, by its path, or null when it has no field there.
function sectionStep(
  section: TemplateSettingSection,
  path: readonly string[],
  value: unknown,
): SettingStep | null {
  if (!startsWith(path, section.scope)) return null;
  const below = path.slice(section.scope.length);
  const own = findSetting(section.settings, below, value);
  if (own) return { path, section: section.title, ...own };
  for (const card of section.cards ?? []) {
    if (!startsWith(below, card.path)) continue;
    const inCard = below.slice(card.path.length);
    const field =
      findSetting(card.settings ?? [], inCard, value) ??
      cardStyleField(card.style ?? [], inCard, value);
    if (field) return { path, section: section.title, card: card.title, ...field };
  }
  return null;
}

// The step that sets a contents setting: the list type and heading level picked, then its field.
function contentsStep(path: readonly string[], value: unknown): SettingStep | null {
  const kind = path[2] === 'kinds' ? (path[3] ?? null) : null;
  const rest = path.slice(kind === null ? 2 : 4);
  const level = rest[0] === 'levels' ? Number(rest[1]) : 0;
  const step = sectionStep(contentsSettings(kind, level), path, value);
  if (!step) return null;
  const type = CONTENTS_KINDS.find(([key]) => key === kind)?.[1] ?? 'All lists';
  const picks: Pick[] = [{ label: 'List type', option: type }];
  if (rest[0] === 'levels')
    picks.push({ label: 'Heading level', option: `Heading ${String(level + 1)}` });
  return { ...step, picks };
}

// The step that sets a setting of the template, by its path.
function stepOf(path: readonly string[], value: unknown): SettingStep | null {
  const [top, style, ...rest] = path;
  // The paragraph's numbering has a section of its own.
  const card = top === 'styles' && style ? TEXT_STYLE_CARDS[style] : undefined;
  if (card && !(style === 'paragraph' && rest[0] === 'numbering')) {
    const field = styleField(rest.join('.'), value);
    return field ? { path, section: 'Text styles', card, ...field } : null;
  }
  if (top === 'styles' && style === 'custom') {
    const field = styleField(rest.slice(1).join('.'), value);
    return field ? { path, section: 'Custom styles', card: rest[0], ...field } : null;
  }
  if (top === 'styles' && style === 'contents') return contentsStep(path, value);
  for (const section of TEMPLATE_SECTIONS) {
    const step = sectionStep(section, path, value);
    if (step) return step;
  }
  return null;
}

/** The steps that set each setting a template holds, below the keys left out. */
export function settingSteps(template: unknown, leftOut: readonly string[]): SettingStep[] {
  const steps: SettingStep[] = [];
  const walk = (value: unknown, path: string[]) => {
    if (leftOut.includes(path.join('.'))) return;
    if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) walk(child, [...path, key]);
      return;
    }
    const step = stepOf(path, value);
    if (!step) throw new Error(`No field sets ${path.join('.')}`);
    steps.push(step);
  };
  walk(template, []);
  return steps;
}

/** The editor's section by its title. */
export const sectionOf = (panel: Locator, title: string) =>
  panel.locator('.ui-property-section').filter({
    has: panel.page().getByRole('button', { name: new RegExp(`^${title}\\b`) }),
  });

/** A card of a section, by its name, which its summary follows. */
export const cardOf = (section: Locator, name: string) =>
  section.locator('.ui-property-card').filter({
    has: section.page().locator('.ui-property-card__name', { hasText: new RegExp(`^${name}$`) }),
  });

/** Opens a card of a section, by its name, and returns it. */
export async function openCard(section: Locator, name: string): Promise<Locator> {
  const card = cardOf(section, name);
  const trigger = card.locator('.ui-property-card__trigger');
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  return card;
}

/** Closes a card of a section, so its fields leave the section's other fields alone. */
export async function closeCard(section: Locator, name: string): Promise<void> {
  const trigger = cardOf(section, name).locator('.ui-property-card__trigger');
  if ((await trigger.getAttribute('aria-expanded')) === 'true') await trigger.click();
}

// Presses a field that goes from unset to on, then off, until it shows the value: a checkbox
// with Space, as its box is drawn over it, a toggle button with a click.
async function cycle(field: Locator, value: unknown, key?: string) {
  const press = () => (key ? field.press(key) : field.click());
  await press();
  if (value === false) await press();
}

// What a field with points is typed as: its number of points.
const pointsOf = (value: unknown) => {
  const match = /^(\d+(?:\.\d+)?)pt$/.exec(String(value));
  if (!match) throw new Error(`Not in points: ${String(value)}`);
  return match[1] ?? '';
};

// Types into a field and commits it.
async function typeIn(field: Locator, text: string) {
  await field.fill(text);
  await field.press('Enter');
}

/**
 * A template without its empty texts, and the objects they leave empty: an emptied field
 * inherits, so a template written field by field holds none.
 */
export function withoutEmptyText(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutEmptyText);
  if (typeof value !== 'object' || value === null) return value;
  // An object left empty goes too, as the editor leaves it out.
  const isGone = (entry: unknown) =>
    entry === '' ||
    (typeof entry === 'object' &&
      entry !== null &&
      !Array.isArray(entry) &&
      !Object.keys(entry).length);
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [key, withoutEmptyText(entry)] as const)
      .filter(([, entry]) => !isGone(entry)),
  );
}

/** Makes a section's picks, so the fields of a step show. */
export async function pickIn(section: Locator, picks: readonly Pick[] = []): Promise<void> {
  const page = section.page();
  for (const { label, option } of picks) {
    await section.getByRole('button', { name: new RegExp(label) }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
    await expect(page.getByRole('listbox')).toHaveCount(0);
  }
}

/** Sets one setting in its field, within the scope that holds its row. */
export async function setField(scope: Locator, step: SettingStep): Promise<void> {
  const { label, value } = step;
  const page = scope.page();
  switch (step.kind) {
    case 'text':
      // An emptied field inherits, so a template written field by field holds no empty text.
      return typeIn(scope.getByRole('textbox', { name: label, exact: true }), String(value));
    case 'points':
      return typeIn(scope.getByRole('textbox', { name: label, exact: true }), pointsOf(value));
    case 'number':
      return typeIn(
        scope.getByRole('textbox', { name: label, exact: true }),
        String(value).replace(/[a-z]+$/, ''),
      );
    case 'color':
      return typeIn(scope.getByRole('textbox', { name: label, exact: true }), String(value));
    case 'combobox': {
      // The list a typed format opens hides the rest of the panel: Escape closes it, keeping the
      // draft, and Enter commits the format.
      const field = scope.getByRole('combobox', { name: label, exact: true });
      await field.fill(String(value));
      await page.keyboard.press('Escape');
      await expect(page.getByRole('listbox')).toHaveCount(0);
      await field.press('Enter');
      return;
    }
    case 'check':
      return cycle(scope.getByRole('switch', { name: label, exact: true }), value, 'Space');
    case 'toggle':
      return cycle(scope.getByRole('button', { name: label, exact: true }), value);
    case 'segment':
      return scope.getByRole('radio', { name: label, exact: true }).click();
    case 'select': {
      await scope.getByRole('button', { name: new RegExp(`${step.label}$`) }).click();
      await page.getByRole('option', { name: String(value), exact: true }).click();
      await expect(page.getByRole('listbox')).toHaveCount(0);
      return;
    }
  }
}
