// Footnote numbers that start again in each section, for a layout without pages, such as the web
// layout, where each section is one page: there the pagination, which numbers footnotes on each
// page, does not run.

import { Plugin, PluginKey } from 'prosemirror-state';
import { numberFootnotes } from './footnote-model.js';
import { isInlineTextOnly } from './transaction-kind.js';

/** When the footnotes are numbered in each section. */
export interface SectionFootnoteNumbersOptions {
  /** Whether they are now, such as in the web layout of a template numbering them per page. */
  readonly enabled: () => boolean;
}

/** Marks a transaction that numbers the footnotes again, as after the layout changed. */
export const sectionFootnoteNumbersKey = new PluginKey('section-footnote-numbers');

/**
 * Numbers the footnotes from 1 in each section after each change that may move one, and after a
 * transaction with `sectionFootnoteNumbersKey` meta, while `enabled` says so.
 */
export function createSectionFootnoteNumbers({ enabled }: SectionFootnoteNumbersOptions): Plugin {
  return new Plugin({
    key: sectionFootnoteNumbersKey,
    appendTransaction(transactions, _before, after) {
      const due = transactions.some(
        (tr) =>
          tr.getMeta(sectionFootnoteNumbersKey) === true ||
          (tr.docChanged && !isInlineTextOnly(tr)),
      );
      if (!due || !enabled()) return null;
      const tr = after.tr;
      return numberFootnotes(tr, { restartEach: 'section' })
        ? tr.setMeta('addToHistory', false)
        : null;
    },
  });
}
