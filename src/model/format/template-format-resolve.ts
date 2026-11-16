// A template with the chain it inherits merged under it. A template names its parent; one that
// names none inherits the host's base template. The host loads each template from its own store; the
// one walk is driven by a synchronous or an asynchronous loader.

import { cloneJson } from '../clone-json.js';
import type {
  RegionSettings,
  TemplateFile,
  TemplateSection,
  TemplateStyles,
} from './template-format.js';

type LooseRecord = Record<string, unknown>;

function isRecord(value: unknown): value is LooseRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isRegionKey(key: string): boolean {
  return key === 'header' || key === 'footer';
}

// Contents levels are kept by their place, so a template that sets one level keeps the others it
// inherits. Paragraph numbering levels describe one scheme together, so a template's list replaces
// the one it inherits whole.
function mergeLevels(parent: unknown[], child: unknown[]): unknown[] {
  const length = Math.max(parent.length, child.length);
  return Array.from({ length }, (_, index) => mergeValue(parent[index], child[index], ''));
}

function mergeValue(parent: unknown, child: unknown, key: string): unknown {
  if (child === null || child === undefined) return cloneJson(parent);
  if (isRegionKey(key) && isRecord(child) && child.inherit === true) return cloneJson(parent);
  if (key === 'levels' && Array.isArray(parent) && Array.isArray(child)) {
    return mergeLevels(parent, child);
  }
  if (!isRecord(parent) || !isRecord(child)) return cloneJson(child);
  const merged: LooseRecord = {};
  for (const name of new Set([...Object.keys(parent), ...Object.keys(child)])) {
    // A numbering's levels are paragraph levels, which merge as a list.
    const childKey = key === 'numbering' && name === 'levels' ? 'numbering-levels' : name;
    merged[name] = mergeValue(parent[name], child[name], childKey);
  }
  return merged;
}

/**
 * Settings over the settings they inherit, into a copy, by the template inheritance rule: a
 * section's styles over the template's, for example.
 */
export function mergeTemplateSettings<T>(
  inherited: T | null | undefined,
  own: T | null | undefined,
): T {
  return mergeValue(inherited, own, '') as T;
}

const HEADING_KEYS = [
  'heading1',
  'heading2',
  'heading3',
  'heading4',
  'heading5',
  'heading6',
] as const;

/**
 * A scope's own styles with each heading level that sets no numbering format taking the format of
 * the nearest higher level these styles set, into a copy, so styles that number heading 1 `A.1.1.`
 * number heading 2 `A.1.` before anything they inherit applies.
 */
export function withInheritedHeadingFormats(
  styles: TemplateStyles | null | undefined,
): TemplateStyles | null | undefined {
  if (!styles) return styles;
  const filled = cloneJson(styles);
  let format: string | null = null;
  for (const key of HEADING_KEYS) {
    const own = filled[key]?.numbering?.format;
    // An empty format numbers nothing, so it passes nothing down.
    if (typeof own === 'string') format = own || null;
    else if (format !== null)
      filled[key] = { ...filled[key], numbering: { ...filled[key]?.numbering, format } };
  }
  return filled;
}

/**
 * A template over its parent, into a copy. A setting that is absent or null takes the parent's,
 * objects merge setting by setting, a list replaces the parent's list whole except a list of
 * contents levels, which merges level by level, a header or footer that asks to inherit takes the
 * parent's, and any other value is the template's own. A heading level the template leaves without
 * a numbering format first takes the nearest higher level's it sets (`withInheritedHeadingFormats`).
 */
export function mergeTemplateFiles(parent: TemplateFile | null, child: TemplateFile): TemplateFile {
  const own = { ...child, styles: withInheritedHeadingFormats(child.styles) };
  const merged = mergeValue(parent, own, '') as TemplateFile;
  merged.id = child.id;
  merged.parent = child.parent ?? null;
  return merged;
}

/**
 * A section's page header or footer: the template's when the section has none or inherits, else the
 * section's settings over the template's, field by field, so a section that sets only a height
 * keeps the template's content.
 */
export function resolveSectionRegion(
  template: Pick<TemplateFile, 'header' | 'footer'>,
  section: Pick<TemplateSection, 'header' | 'footer'> | null | undefined,
  region: 'header' | 'footer',
): RegionSettings | null {
  const own = section?.[region];
  const inherited = template[region] ?? null;
  if (!own || own.inherit === true) return inherited;
  return mergeTemplateSettings(inherited, own);
}

/** How a template's chain is resolved. */
export interface TemplateResolutionOptions {
  /** Loads a template by id: the stored template, or nothing when there is none. */
  loadTemplate: (templateId: string) => unknown;
  /** The template every template without a parent inherits, unless it is that template. */
  baseTemplateId?: string | null | undefined;
}

function isTemplate(value: unknown): value is TemplateFile {
  return isRecord(value) && typeof value.id === 'string';
}

// The one resolution walk: it yields each template id it needs and is resumed with the loaded
// template, so a synchronous and an asynchronous loader drive the same steps.
function* resolutionWalk(
  template: TemplateFile,
  options: TemplateResolutionOptions,
): Generator<string, TemplateFile, unknown> {
  const chain: TemplateFile[] = [template];
  const visited = new Set([template.id]);
  for (;;) {
    const last = chain[chain.length - 1] as TemplateFile;
    const base = options.baseTemplateId ?? null;
    const parentId = last.parent || (base && last.id !== base ? base : null);
    if (!parentId || visited.has(parentId)) break;
    visited.add(parentId);
    const parent = yield parentId;
    if (!isTemplate(parent)) break;
    chain.push(parent);
  }
  return chain.reduceRight<TemplateFile | null>(
    (inherited, entry) => mergeTemplateFiles(inherited, entry),
    null,
  ) as TemplateFile;
}

/**
 * A template with its chain merged under it: its parent's, and so on, ending at the base template.
 * A chain that comes back to a template it already holds stops there, and a template the loader
 * does not find ends it.
 */
export function resolveTemplateFile(
  template: TemplateFile,
  options: TemplateResolutionOptions,
): TemplateFile {
  const walk = resolutionWalk(template, options);
  let step = walk.next();
  while (!step.done) step = walk.next(options.loadTemplate(step.value));
  return step.value;
}

/** `resolveTemplateFile` with an asynchronous loader. */
export async function resolveTemplateFileAsync(
  template: TemplateFile,
  options: TemplateResolutionOptions,
): Promise<TemplateFile> {
  const walk = resolutionWalk(template, options);
  let step = walk.next();
  while (!step.done) step = walk.next(await options.loadTemplate(step.value));
  return step.value;
}

function* parentCycleWalk(templateId: string, parentId: string | null) {
  const visited = new Set<string>();
  let cursor = parentId;
  while (cursor) {
    if (cursor === templateId) return true;
    if (visited.has(cursor)) return false;
    visited.add(cursor);
    const parent: unknown = yield cursor;
    cursor = isTemplate(parent) && parent.parent ? parent.parent : null;
  }
  return false;
}

/** Whether giving a template this parent would make its chain come back to it. */
export function hasTemplateParentCycle(
  templateId: string,
  parentId: string | null,
  loadTemplate: (templateId: string) => unknown,
): boolean {
  const walk = parentCycleWalk(templateId, parentId);
  let step = walk.next();
  while (!step.done) step = walk.next(loadTemplate(step.value));
  return step.value;
}

/** `hasTemplateParentCycle` with an asynchronous loader. */
export async function hasTemplateParentCycleAsync(
  templateId: string,
  parentId: string | null,
  loadTemplate: (templateId: string) => unknown,
): Promise<boolean> {
  const walk = parentCycleWalk(templateId, parentId);
  let step = walk.next();
  while (!step.done) step = walk.next(await loadTemplate(step.value));
  return step.value;
}
