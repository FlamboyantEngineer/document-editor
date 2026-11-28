// The text of the editor's own banners: a change suggest mode could not record, the document out of
// step with its template, the fonts that did not load, and pages that cannot be laid out.

import type { SuggestionRefusalReason } from '../../engine/suggestion-refusal.js';
import type { SectionDrift } from '../../engine/template-sync.js';
import type { BrowserLayoutReason } from '../../pagination/index.js';

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
  /** The host serves no fonts the pages can be laid out with: the document shows unpaged. */
  readonly pagesUnavailable: string;
  /** Why, and what the reader sees instead. */
  readonly pagesUnavailableDetail: (reason: BrowserLayoutReason) => string;
}

const list = new Intl.ListFormat('en', { type: 'conjunction' });

const DRIFT_KINDS: Readonly<Record<SectionDrift['kind'], string>> = {
  missing: 'missing',
  unexpected: 'not in the template',
  stale: 'changed',
  misplaced: 'out of order',
};

const UNAVAILABLE: Readonly<Record<BrowserLayoutReason, string>> = {
  'no-shaper': 'The host serves no text shaper.',
  'no-files': 'The host serves no font files.',
  'shaper-failed': 'The text shaper did not load.',
  'files-failed': 'The font files did not load.',
  'timed-out': 'The text shaper or the font files took too long to arrive.',
  'no-faces': 'None of the font files could be read.',
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
  pagesUnavailable: 'The pages cannot be laid out',
  pagesUnavailableDetail: (reason) =>
    `${UNAVAILABLE[reason]} The document shows without pages, in fallback fonts.`,
};
