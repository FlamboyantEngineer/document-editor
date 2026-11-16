// The text of the editor's own banners: the document out of step with its template, and the fonts
// that did not load.

import type { SectionDrift } from '../../engine/template-sync.js';

/** The text of the editor's banners. */
export interface BannerLabels {
  /** Names the banner region. */
  readonly banners: string;
  readonly templateDrift: string;
  /**
   * What drifted, from the sections that did; `nameOf` gives a section's name as the template shows
   * it, its label or else its name.
   */
  readonly templateDriftDetail: (
    drift: readonly SectionDrift[],
    nameOf: (name: string) => string,
  ) => string;
  readonly updateFromTemplate: string;
  /** A newer revision of the document's template was saved. */
  readonly templateUpdated: string;
  /** Moves the document to the newer template revision. */
  readonly updateTemplate: string;
  readonly fontsMissing: string;
  /** Which families did not load. */
  readonly fontsMissingDetail: (families: readonly string[]) => string;
  /** Shown in place of pages that wait for template fonts that did not load, given them. */
  readonly fontsFailed: (families: readonly string[]) => string;
}

const list = new Intl.ListFormat('en', { type: 'conjunction' });

const DRIFT_KINDS: Readonly<Record<SectionDrift['kind'], string>> = {
  missing: 'missing',
  unexpected: 'not in the template',
  stale: 'changed',
  misplaced: 'out of order',
};

export const DEFAULT_BANNER_LABELS: BannerLabels = {
  banners: 'Document notices',
  templateDrift: 'This document is out of step with its template',
  templateDriftDetail: (drift, nameOf) =>
    `Sections: ${list.format(drift.map((each) => `${nameOf(each.name)} (${DRIFT_KINDS[each.kind]})`))}.`,
  updateFromTemplate: 'Update from template',
  templateUpdated: 'The template has a newer version',
  updateTemplate: 'Use the newer version',
  fontsMissing: 'Some fonts did not load',
  fontsMissingDetail: (families) =>
    `${list.format(families)} ${families.length === 1 ? 'shows' : 'show'} in a fallback font, so pages may break differently.`,
  fontsFailed: (families) => `The document cannot be shown: ${list.format(families)} did not load.`,
};
