// What one kind of list of contents shows under a template: its title and each level's
// indentation, spacing and leader character. A kind's own settings apply over the lists' settings, and each
// level's over its list's, so a template sets a list of figures apart from its table of contents.

import type {
  ContentsLeader,
  ContentsLevelSettings,
  ContentsSettings,
} from '../format/template-format.js';
import { mergeTemplateSettings } from '../format/template-format-resolve.js';

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
