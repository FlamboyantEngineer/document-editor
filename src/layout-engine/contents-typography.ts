// A list of contents' typography: its rows' level fonts, its title's and its empty message's, as
// the stylesheet draws them (DOCE-PAGINATION-9.13, 9.14).

import { resolveContentsList } from '../model/templates/template-settings.js';
import {
  type BlockTypography,
  fontOnly,
  scopeTypography,
  type TypographySource,
} from './typography.js';

/** The line height of a list of contents' rows, as the stylesheet sets it. */
const CONTENTS_LINE_HEIGHT = 1.5;

/** A list of contents' text besides its rows: its title, or the message it shows when empty. */
export type ContentsTextRole = 'title' | 'empty';

/**
 * A list of contents row's typography: its kind's level font over the entries' in its scope, unset
 * values the paragraph's family and size, a weight of 400 and upright, at a line height of 1.5.
 */
export function contentsTypography(
  { kind, level, scope }: { kind: string; level: number; scope?: string | null | undefined },
  source: TypographySource,
): BlockTypography {
  const { styles, blockOf } = scopeTypography({ ...source, scope });
  const levels = resolveContentsList(styles.contents, kind).levels;
  const own = levels[Math.min(levels.length, Math.max(1, level)) - 1]?.font;
  const defaults = { lineHeight: CONTENTS_LINE_HEIGHT, weight: 400 };
  const text = { ...fontOnly(own), lineHeight: CONTENTS_LINE_HEIGHT };
  return { ...blockOf(text, defaults), marginTop: 0, marginBottom: 0 };
}

/**
 * A list of contents' title or empty message typography, at the paragraph's line height as the
 * page content sets it: the title in its kind's title font, unset values the paragraph's family,
 * 16px, bold and upright; the empty message in the paragraph's font, italic.
 */
export function contentsTextTypography(
  {
    kind,
    scope,
    role,
  }: { kind: string; scope?: string | null | undefined; role: ContentsTextRole },
  source: TypographySource,
): BlockTypography {
  const { styles, paragraph, blockOf } = scopeTypography({ ...source, scope });
  const lineHeight = styles.paragraph?.lineHeight ?? 1.5;
  if (role === 'empty') {
    const block = blockOf({ lineHeight }, { lineHeight, weight: paragraph.weight });
    return { ...block, font: { ...block.font, italic: true }, marginTop: 0, marginBottom: 0 };
  }
  const title = resolveContentsList(styles.contents, kind).titleFont;
  const defaults = { size: '16px', lineHeight, weight: 700 };
  const block = blockOf({ ...fontOnly(title), lineHeight }, defaults);
  return { ...block, marginTop: 0, marginBottom: 0 };
}
