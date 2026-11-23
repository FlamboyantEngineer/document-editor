// The anchors and links of the footnote markers and entries a static render draws, page by page. A
// footnote can be drawn on more than one page (a marker in a table's repeated header row, with its
// entry on each page the row repeats on): each page's marker links to that page's entry and the
// entry's number back to that page's marker, under the footnote's canonical id on the first page
// it is drawn on and a numbered anchor beside it on each later one (DOCE-PAGINATION-13.11).

import { footnoteEntryAnchor, footnoteMarkerAnchor } from '../model/schema/footnote-nodes.js';

/** A footnote marker or entry as a static render meets it, in the order it draws them. */
interface FootnotePart {
  readonly id: string;
  readonly marker: boolean;
  /** The page it is drawn on, by index; any one number for a render without pages. */
  readonly page: number;
}

/** The anchor a part takes, if any, and where its link goes, if anywhere. */
interface FootnotePartLink {
  readonly anchor: string | null;
  readonly href: string | null;
}

// An anchor on the n-th page a footnote is drawn on: the canonical one on the first.
const nth = (anchor: string, occurrence: number) =>
  occurrence === 1 ? anchor : `${anchor}~${String(occurrence)}`;

interface Occurrence {
  readonly number: number;
  marker: boolean;
  entry: boolean;
}

// Each footnote's pages, in the order its parts are drawn on them, with what each page holds.
function occurrences(parts: readonly FootnotePart[]) {
  const byId = new Map<string, Map<number, Occurrence>>();
  for (const { id, marker, page } of parts) {
    const pages = byId.get(id) ?? new Map<number, Occurrence>();
    byId.set(id, pages);
    const at = pages.get(page) ?? { number: pages.size + 1, marker: false, entry: false };
    pages.set(page, at);
    if (marker) at.marker = true;
    else at.entry = true;
  }
  return byId;
}

/**
 * Each part's anchor and link, in the parts' order. A page's first marker of a footnote takes its
 * marker anchor and links to the entry on its page, else to the footnote's first entry. An entry
 * on a page that holds its marker, or the footnote's first entry, takes its entry anchor and links
 * back to the marker on its page, else to the footnote's first marker; a later part of an entry
 * continued from a page before takes neither, as a later marker on the same page takes no anchor.
 */
export function footnotePartLinks(parts: readonly FootnotePart[]): FootnotePartLink[] {
  const byId = occurrences(parts);
  const firstOf = (id: string, marker: boolean) =>
    [...(byId.get(id)?.values() ?? [])].find((each) => (marker ? each.marker : each.entry));
  const taken = new Set<string>();
  const take = (anchor: string) => {
    if (taken.has(anchor)) return null;
    taken.add(anchor);
    return anchor;
  };
  return parts.map(({ id, marker, page }) => {
    const at = byId.get(id)?.get(page);
    if (!at) return { anchor: null, href: null };
    if (marker) {
      const entry = at.entry ? at : firstOf(id, false);
      return {
        anchor: take(nth(footnoteMarkerAnchor(id), at.number)),
        href: `#${nth(footnoteEntryAnchor(id), entry?.number ?? 1)}`,
      };
    }
    if (!at.marker && firstOf(id, false) !== at) return { anchor: null, href: null };
    const anchor = take(nth(footnoteEntryAnchor(id), at.number));
    const back = at.marker ? at : firstOf(id, true);
    return {
      anchor,
      href: anchor && back ? `#${nth(footnoteMarkerAnchor(id), back.number)}` : null,
    };
  });
}
