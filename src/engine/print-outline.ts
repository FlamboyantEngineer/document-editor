// The outline a printed document's bookmarks are made from: the document's headings as the pages
// show them now, each with its element id, its number, the page it starts on and where on it.

import type { EditorView } from 'prosemirror-view';
import type { TemplateFile } from '../model/index.js';
import { documentOutline } from './outline.js';

/** One heading of a snapshot's outline. */
export interface SnapshotOutlineEntry {
  readonly elementId: string;
  readonly level: number;
  readonly text: string;
  /** Its number as the template numbers it, or an empty string. */
  readonly number: string;
  /** The page it starts on, from 0, in the order the snapshot prints the pages. */
  readonly page: number;
  /** Its top from the page's top, in unscaled CSS pixels. */
  readonly top: number;
}

// How much the pages are scaled on screen, such as by the editor's zoom.
function scaleOf(page: HTMLElement): number {
  const height = page.offsetHeight;
  return height > 0 ? page.getBoundingClientRect().height / height : 1;
}

/**
 * The document's headings as its pages show them now, for a printed document's bookmarks: each
 * heading with an element id, once, on the page its first part is on and at its top there. A
 * heading not on a page, as in the web layout, is left out.
 */
export function snapshotOutline(view: EditorView, template: TemplateFile): SnapshotOutlineEntry[] {
  const pages = [...view.dom.querySelectorAll<HTMLElement>('.pm-page')];
  const firsts = new Map<string, Element>();
  for (const element of view.dom.querySelectorAll('[data-id]')) {
    const id = element.getAttribute('data-id') ?? '';
    if (!firsts.has(id)) firsts.set(id, element);
  }
  const entries: SnapshotOutlineEntry[] = [];
  for (const heading of documentOutline(view.state, template)) {
    const element = heading.elementId ? firsts.get(heading.elementId) : undefined;
    const page = element?.closest<HTMLElement>('.pm-page');
    const index = page ? pages.indexOf(page) : -1;
    if (!heading.elementId || !element || !page || index < 0) continue;
    const top = element.getBoundingClientRect().top - page.getBoundingClientRect().top;
    entries.push({
      elementId: heading.elementId,
      level: heading.level,
      text: heading.text,
      number: heading.number,
      page: index,
      top: top / scaleOf(page),
    });
  }
  return entries;
}
