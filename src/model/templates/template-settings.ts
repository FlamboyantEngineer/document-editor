// Reading a resolved template's settings: what one kind of list of contents shows (its title and
// each level's leader, a kind's settings over the lists' and a level's over its list's), the
// entries of a host's keyed extension collection, and the settings a template leaves unset.

import type {
  ContentsLeader,
  ContentsLevelSettings,
  ContentsSettings,
  TemplateFile,
} from '../format/template-format.js';
import { mergeTemplateSettings } from '../format/template-format-resolve.js';
import { BASE_TEMPLATE } from './base-template.js';

/** A list level's settings, its leader resolved. */
export interface ResolvedContentsLevel extends Omit<ContentsLevelSettings, 'leader'> {
  /** The leader's character, or null for none. Its spacing is a custom property (DOCE-TEMPLATES-5.2). */
  leader: string | null;
}

/** One kind of list's settings. */
export interface ResolvedContentsList {
  /** The template's title for the list, or null to show the editor's. */
  title: string | null;
  /** Levels 1 to 6. */
  levels: ResolvedContentsLevel[];
}

const LEVELS = 6;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
const DEFAULT_LEADER = '.';

/**
 * One kind of list's settings, by its key: the kind's title, and each level's settings with its
 * leader resolved, the kind's over the lists' and a level's over its list's. An empty leader
 * character draws none; without any, the leader is `.`.
 */
export function resolveContentsList(
  contents: ContentsSettings | null | undefined,
  kind: string,
): ResolvedContentsList {
  const own = contents?.kinds?.[kind];
  const levels = Array.from({ length: LEVELS }, (_, index): ResolvedContentsLevel => {
    const { leader: levelLeader, ...level } = contents?.levels?.[index] ?? {};
    // From the least to the most specific: the lists', their level's, the kind's, its level's.
    const leader = [levelLeader, own?.leader, own?.levels?.[index]?.leader].reduce<ContentsLeader>(
      (inherited, next) => mergeTemplateSettings(inherited, next),
      contents?.leader ?? {},
    );
    const character = leader.character ?? DEFAULT_LEADER;
    return { ...level, leader: character || null };
  });
  return { title: own?.title || null, levels };
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
  if (Array.isArray(reference) && Array.isArray(value)) {
    return reference.flatMap((entry, index) =>
      missingPaths(entry, value[index], `${path}[${String(index)}]`),
    );
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
