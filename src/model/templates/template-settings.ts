// Reading a resolved template's settings: what one kind of list of contents looks like (the kind's
// settings over the lists', each level's type over the entries' and its leader over the list's),
// the entries of a host's keyed extension collection, and the settings a template leaves unset.

import type {
  ContentsKindSettings,
  ContentsLeader,
  ContentsLevelSettings,
  ContentsSettings,
  FontSettings,
  Length,
  Sides,
  TemplateFile,
} from '../format/template-format.js';
import { mergeTemplateSettings } from '../format/template-format-resolve.js';
import { BASE_TEMPLATE } from './base-template.js';

/** A list level's settings: its type over the entries', and its leader over the list's. */
export interface ResolvedContentsLevel {
  /** The entry's type at this level: the level's size, weight and slant over the entries'. */
  font: FontSettings;
  indentation?: Length | null | undefined;
  spaceBefore?: Length | null | undefined;
  spaceAfter?: Length | null | undefined;
  /** The leader, or null for none. Its character is never empty. */
  leader: (ContentsLeader & { character: string }) | null;
}

/** One kind of list's settings, its own over the lists'. */
export interface ResolvedContentsList {
  /** The template's title for the list, or null to show the editor's. */
  title: string | null;
  titleFont: FontSettings;
  entry: FontSettings;
  padding: Sides<Length>;
  spacing: Sides<Length>;
  /** Levels 1 to 6. */
  levels: ResolvedContentsLevel[];
}

const LEVELS = 6;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
const DEFAULT_LEADER = '.';

// A level's type over the entries': only the size, weight and slant a level sets.
function levelFont(entry: FontSettings, level: ContentsLevelSettings): FontSettings {
  const own: FontSettings = {};
  if (level.size) own.size = level.size;
  if (typeof level.weight === 'number') own.weight = level.weight;
  if (typeof level.italic === 'boolean') own.italic = level.italic;
  return { ...entry, ...own };
}

/**
 * One kind of list's settings, by its key: the kind's own settings over the lists' (levels merge
 * by index), then each level's size, weight and slant over the entries' type and its leader over
 * the list's. An empty leader character draws none; without any, the leader is `.`.
 */
export function resolveContentsList(
  contents: ContentsSettings | null | undefined,
  kind: string,
): ResolvedContentsList {
  const { kinds, ...lists } = contents ?? {};
  const own: ContentsKindSettings = mergeTemplateSettings<ContentsKindSettings>(
    lists,
    kinds?.[kind] ?? null,
  );
  const entry = own.entry ?? {};
  const levels = Array.from({ length: LEVELS }, (_, index): ResolvedContentsLevel => {
    const {
      leader: levelLeader,
      size: _size,
      weight: _weight,
      italic: _italic,
      ...level
    } = own.levels?.[index] ?? {};
    const leader = mergeTemplateSettings<ContentsLeader>(own.leader ?? {}, levelLeader);
    const character = leader.character ?? DEFAULT_LEADER;
    return {
      ...level,
      font: levelFont(entry, own.levels?.[index] ?? {}),
      leader: character ? { ...leader, character } : null,
    };
  });
  return {
    title: own.customTitle || null,
    titleFont: own.title ?? {},
    entry,
    padding: own.padding ?? {},
    spacing: own.spacing ?? {},
    levels,
  };
}

/**
 * The entries of a keyed collection a host keeps in `extensions`, after inheritance: an entry set
 * to `false` removes the one inherited, as null inherits it.
 */
export function extensionRecord(
  template: Pick<TemplateFile, 'extensions'>,
  name: string,
): Record<string, unknown> {
  const record = template.extensions?.[name];
  if (!isRecord(record)) return {};
  return Object.fromEntries(Object.entries(record).filter(([, entry]) => entry !== false));
}

function missingPaths(reference: unknown, value: unknown, path: string): string[] {
  if (value === null || value === undefined) return [path];
  // A list's settings are its own entries': one shorter than the reference misses none past its end.
  if (Array.isArray(reference) && Array.isArray(value)) {
    return reference
      .slice(0, value.length)
      .flatMap((entry, index) => missingPaths(entry, value[index], `${path}[${String(index)}]`));
  }
  if (!isRecord(reference) || !isRecord(value)) return [];
  return Object.entries(reference).flatMap(([key, entry]) =>
    missingPaths(entry, value[key], path ? `${path}.${key}` : key),
  );
}

/**
 * The settings a resolved template leaves unset that a full template sets, by path, such as
 * `styles.heading1.size`: those of the base template, or of the host's base. A template resolved
 * over the base misses none; a root template (DOCE-TEMPLATES-5.7) lists what it should set.
 */
export function missingTemplateSettings(
  template: TemplateFile,
  base: TemplateFile = BASE_TEMPLATE,
): string[] {
  const { id: _id, name: _name, parent: _parent, sections: _sections, ...settings } = base;
  return missingPaths(settings, template, '');
}
