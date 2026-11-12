// The text of the editor's own banners: the document out of step with its template, and the fonts
// that did not load.

import type { SectionDrift } from '../../engine/template-sync.js';

/** The text of the editor's banners. */
export interface BannerLabels {
  /** Names the banner region. */
  readonly banners: string;
  readonly templateDrift: string;
  /** What drifted, from the sections that did. */
  readonly templateDriftDetail: (drift: readonly SectionDrift[]) => string;
  readonly updateFromTemplate: string;
  readonly fontsMissing: string;
  /** Which families did not load. */
  readonly fontsMissingDetail: (families: readonly string[]) => string;
}

const list = new Intl.ListFormat('en', { type: 'conjunction' });

const DRIFT_KINDS: Readonly<Record<SectionDrift['kind'], string>> = {
  missing: 'missing',
  unexpected: 'not in the template',
  stale: 'changed',
};

export const DEFAULT_BANNER_LABELS: BannerLabels = {
  banners: 'Document notices',
  templateDrift: 'This document is out of step with its template',
  templateDriftDetail: (drift) =>
    `Sections: ${list.format(drift.map((each) => `${each.name} (${DRIFT_KINDS[each.kind]})`))}.`,
  updateFromTemplate: 'Update from template',
  fontsMissing: 'Some fonts did not load',
  fontsMissingDetail: (families) =>
    `${list.format(families)} ${families.length === 1 ? 'shows' : 'show'} in a fallback font, so pages may break differently.`,
};
