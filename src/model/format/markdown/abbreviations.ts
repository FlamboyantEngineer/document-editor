// A list of abbreviations as Markdown: a two-column table of the abbreviations the document cites,
// each entry once, in the order the list shows them, each with its expansion.

import { compareAbbreviations } from '../../glossary.js';
import type { StoredNode } from '../document-format.js';
import { escapeText } from './escape.js';
import { text } from './writing.js';

/** An entry the document cites, as a list of abbreviations shows it. */
export interface CitedAbbreviation {
  readonly entryId: string;
  readonly abbr: string;
  readonly expansion: string;
}

/** The entries a document's abbreviations cite, each once, in the order a list shows them. */
export function citedAbbreviations(content: readonly StoredNode[]): CitedAbbreviation[] {
  const found = new Map<string, CitedAbbreviation>();
  const walk = (nodes: readonly StoredNode[] | undefined) => {
    for (const node of nodes ?? []) {
      const entryId = text(node.attrs?.entry);
      if (node.type === 'abbreviation' && entryId && !found.has(entryId)) {
        const abbr = text(node.attrs?.abbreviation);
        found.set(entryId, { entryId, abbr, expansion: text(node.attrs?.expansion) });
      }
      walk(node.content);
    }
  };
  walk(content);
  return [...found.values()].sort(compareAbbreviations);
}

/** A list of abbreviations as a table, or null when the document cites none. */
export function abbreviationTable(cited: readonly CitedAbbreviation[]): string | null {
  if (cited.length === 0) return null;
  return [
    '| Abbreviation | Expansion |',
    '| --- | --- |',
    ...cited.map(({ abbr, expansion }) => `| ${escapeText(abbr)} | ${escapeText(expansion)} |`),
  ].join('\n');
}
