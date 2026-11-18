// The text of the editor's own banners: a change suggest mode could not record, the document out of
// step with its template, and the fonts that did not load.

import type { SuggestionRefusalReason } from '../../engine/suggestion-refusal.js';
import type { SectionDrift } from '../../engine/template-sync.js';

/** The text of the editor's banners. */
export interface BannerLabels {
  /** Names the banner region. */
  readonly banners: string;
  /** A change suggest mode could not record, so it was not made. */
  readonly suggestionRefused: string;
  /** Why the change could not be suggested, and what the writer can do. */
  readonly suggestionRefusedDetail: (reason: SuggestionRefusalReason) => string;
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

const REFUSALS: Readonly<Record<SuggestionRefusalReason, string>> = {
  structure:
    'Suggestions cannot record wrapping blocks in a list, nesting them or lifting them out.',
  split: 'Suggestions cannot record splitting a list item or a block laid out across pages.',
  block: 'Suggestions cannot record inserting this kind of block.',
  formatting: 'Suggestions cannot record this formatting change.',
  object: 'Suggestions cannot record deleting this object whole.',
  other: 'Suggestions cannot record this change.',
};

export const DEFAULT_BANNER_LABELS: BannerLabels = {
  banners: 'Document notices',
  suggestionRefused: 'This change was not made',
  suggestionRefusedDetail: (reason) =>
    `${REFUSALS[reason]} Stop suggesting to make it directly, if you may edit.`,
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
