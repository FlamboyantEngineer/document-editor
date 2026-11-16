// The template editor's contents settings as data: the settings of every list, or of one kind of
// list over them, with its custom title; the title's and entries' type, the padding and spacing,
// the leader; and for a table of contents, one heading level's type, indentation, spacing and
// leader.

import { FONT_PARTS } from './object-settings.js';
import {
  setting,
  type TemplateSetting,
  type TemplateSettingCard,
  type TemplateSettingSection,
} from './template-settings.js';

/** The kinds of list a document has, by their key, in the order the insert menu offers them. */
export const CONTENTS_KINDS: readonly (readonly [string, string])[] = [
  ['toc', 'Table of contents'],
  ['figures', 'List of figures'],
  ['tables', 'List of tables'],
  ['equations', 'List of equations'],
  ['codeBlocks', 'List of code'],
  ['references', 'List of references'],
  ['abbreviations', 'List of abbreviations'],
];

/** The kinds of list that show neither page numbers nor leaders. */
const WITHOUT_PAGES: ReadonlySet<string> = new Set(['references', 'abbreviations']);

/** Whether the settings of every list (`null`) or of a kind have heading levels to pick from. */
export const hasLevels = (kind: string | null) => kind === null || kind === 'toc';

const points = { type: 'points' } as const;

// A leader's settings: the character that fills the line to the page number, the space between
// its characters, and its gaps to the entry's text and to the page number, in points.
const LEADER_SETTINGS: TemplateSetting[] = [
  setting('character', 'Leader', { type: 'text' }),
  setting('spacing', 'Leader spacing', points),
  setting('gapBefore', 'Space before leader', points),
  setting('gapAfter', 'Space after leader', points),
];

/**
 * The contents settings the template editor shows: every list's (`kind` null) or one kind's own,
 * over every list's; and for those and a table of contents, those of one heading level (0 to 5).
 */
export function contentsSettings(kind: string | null, level = 0): TemplateSettingSection {
  const leaders = kind === null || !WITHOUT_PAGES.has(kind);
  const levelName = `Heading ${String(level + 1)}`;
  const levelPath = ['levels', String(level)];
  const cards: TemplateSettingCard[] = [
    { id: 'title', title: 'Title', path: ['title'], style: FONT_PARTS },
    { id: 'entry', title: 'Entries', path: ['entry'], style: FONT_PARTS },
    ...(leaders
      ? [
          {
            id: 'leader',
            title: 'Leader',
            path: ['leader'],
            style: ['emphasis'],
            settings: LEADER_SETTINGS,
          } satisfies TemplateSettingCard,
        ]
      : []),
    ...(hasLevels(kind)
      ? [
          {
            id: `level-${String(level)}`,
            title: levelName,
            path: levelPath,
            style: ['size', 'emphasis'],
            settings: [
              setting('indentation', 'Indentation', { type: 'length' }),
              setting('spaceBefore', 'Space before', points),
              setting('spaceAfter', 'Space after', points),
            ],
          } satisfies TemplateSettingCard,
          {
            id: `level-${String(level)}-leader`,
            title: `${levelName} leader`,
            path: [...levelPath, 'leader'],
            style: ['emphasis'],
            settings: LEADER_SETTINGS,
          } satisfies TemplateSettingCard,
        ]
      : []),
  ];
  return {
    id: 'contents',
    title: 'Contents',
    scope: ['styles', 'contents', ...(kind === null ? [] : ['kinds', kind])],
    documentOnly: true,
    settings: [
      ...(kind === null ? [] : [setting('customTitle', 'Custom title', { type: 'text' })]),
      setting('padding', 'Padding', { type: 'sides', unit: 'pt', side: 'padding' }),
      setting('spacing', 'Spacing', { type: 'sides', unit: 'pt', side: 'spacing' }),
    ],
    cards,
  };
}

/**
 * Levels' indentation and spacing set all at once: each level indented by `indent` past the one
 * above it, and each spaced `before` and `after`, over the levels a template already sets. A
 * value left null keeps what each level has.
 */
export function withAllLevels(
  levels: unknown,
  {
    indent,
    before,
    after,
  }: { indent?: number | null; before?: number | null; after?: number | null },
): Record<string, unknown>[] {
  const current: unknown[] = Array.isArray(levels) ? levels : [];
  return Array.from({ length: 6 }, (_, index) => {
    const own = current[index];
    const next: Record<string, unknown> =
      own && typeof own === 'object' ? { ...(own as Record<string, unknown>) } : {};
    if (typeof indent === 'number') next.indentation = `${String(index * indent)}pt`;
    if (typeof before === 'number') next.spaceBefore = `${String(before)}pt`;
    if (typeof after === 'number') next.spaceAfter = `${String(after)}pt`;
    return next;
  });
}
