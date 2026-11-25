// The editing's footnote plugins: the footnotes, with the places the host lets them be cited, and
// their numbers, in their places among the editing's plugins.

import type { RichTextPluginContribution } from '@flamboyantengineer/ui-components/rich-text-editor';
import type { Transaction } from 'prosemirror-state';
import type { TemplateFile } from '../model/index.js';
import { createFootnoteNumbers, unpagedNumbering } from './footnote-numbers.js';
import { createFootnotes } from './footnotes.js';

/**
 * The footnotes, where the host lets them be cited, and the numbers the state's own view draws, by
 * its template (DOCE-FOOTNOTES-2.2).
 */
export const footnotePlugins = (
  {
    template,
    citingPlaces,
  }: {
    template?: (() => TemplateFile) | undefined;
    citingPlaces?: readonly string[] | undefined;
  },
  isRemote: ((tr: Transaction) => boolean) | undefined,
): RichTextPluginContribution[] => [
  { name: 'footnotes', priority: 490, build: () => [createFootnotes({ isRemote, citingPlaces })] },
  {
    name: 'footnote-numbers',
    priority: 491,
    build: () => [createFootnoteNumbers({ numbering: () => unpagedNumbering(template?.()) })],
  },
];
