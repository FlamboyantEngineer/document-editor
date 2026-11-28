// The read-only viewer of a document's laid-out pages (DOCE-PAGINATION-13.6): the layout the editor
// handed over (`PagesLayout`) drawn as the print drawn from it draws it, every forced block on its
// computed lines, without an editor, a measuring view or a layout of its own. Every page is an
// empty sheet of its section's size until it nears the viewport, so a long document keeps few
// elements, and every number is the one the engine laid the pages out with, whichever pages are
// drawn.

import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import type { PagesLayout } from '../../document/pages-layout.js';
import {
  drawLayoutPages,
  type LayoutPrintOptions,
  VIEW_CLASSES,
} from '../../document/print-pages.js';
import { printElement, printHtml } from '../../document/print-tree.js';
import { type TemplateFile, templateProperties } from '../../model/index.js';
import { createHooks } from '../../utils/hooks.js';
import { isElement } from '../../utils/is-element.js';
import { watchNearbySheets } from './nearby-sheets.js';
import { useViewerFonts } from './use-viewer-fonts.js';

const hooks = createHooks('document-viewer');

// The editor's root class, which the document's stylesheets style its pages under.
const EDITOR_CLASS = 'de-document-editor';

export interface DocumentViewerProps {
  /** The pages' layout, from the editor handle's `pagesLayout()`. */
  layout: PagesLayout;
  /** The template the pages were laid out under. */
  template: TemplateFile;
  /** Links and the document kit, as for `renderLayoutPrintPage`; suggestions show as laid out. */
  options?: Omit<LayoutPrintOptions, 'title' | 'styles' | 'stylesheets'> | undefined;
  /** How many whole pages before and after the ones in view are drawn; `Infinity` draws them all. */
  overscan?: number | undefined;
  /** The viewer's accessible name. */
  label?: string | undefined;
  className?: string | undefined;
}

// Each page's sheet, empty, in its section, as the pages' document draws them.
function sheetsHtml(sections: ReturnType<typeof drawLayoutPages>['sections']): string {
  return printHtml(
    sections.map((section) =>
      printElement(
        'div',
        section.attrs,
        section.pages.map((page) => printElement('div', page.attrs)),
      ),
    ),
  );
}

// Whether two options objects hold the same value in every field.
function sameFields<T extends object>(one: T | undefined, other: T | undefined): boolean {
  if (one === other) return true;
  if (!one || !other) return false;
  const fields = Object.entries(one);
  return (
    fields.length === Object.keys(other).length &&
    fields.every(
      ([key, value]) =>
        Object.prototype.propertyIsEnumerable.call(other, key) &&
        Object.is((other as Record<string, unknown>)[key], value),
    )
  );
}

// The options as they were while each of their fields is the same, so a host that passes a new
// object of the same fields on each render does not draw every page again.
function useSameOptions<T extends object>(options: T | undefined): T | undefined {
  const [kept, keep] = useState(options);
  const same = sameFields(kept, options);
  if (!same) keep(options);
  return same ? kept : options;
}

// The pages to draw: those in view and as many on each side.
function wantedPages(visible: Iterable<number>, overscan: number, total: number): Set<number> {
  const wanted = new Set<number>();
  for (const index of visible) {
    const from = Math.max(0, index - overscan);
    const to = Math.min(total - 1, index + overscan);
    for (let page = from; page <= to; page += 1) wanted.add(page);
  }
  return wanted;
}

// The anchor a link's fragment names: decoded, or as written when it does not decode (a literal
// `%`), the first of the two that names an anchor of the pages.
function fragmentTarget(href: string, pageOf: ReadonlyMap<string, number>) {
  const raw = href.slice(1);
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Not percent-encoded: the fragment is its own text.
  }
  return [decoded, raw].find((id) => pageOf.has(id));
}

// Whether a click is the link's ordinary activation, which the viewer takes over: the main button
// or Enter, no modifier asking the browser for a new tab or window, not cancelled before.
const ordinary = (event: MouseEvent) =>
  !event.defaultPrevented &&
  event.button === 0 &&
  !event.ctrlKey &&
  !event.metaKey &&
  !event.shiftKey &&
  !event.altKey;

// Follows each link inside the pages to an anchor of theirs (a reference, a footnote, a list of
// contents row): `show` draws the page holding it and gives the anchor, which is scrolled to
// (DOCE-PAGINATION-13.9). A modified click is left to the browser.
function followLinks(
  element: HTMLElement,
  pageOf: ReadonlyMap<string, number>,
  show: (at: { index: number; id: string }) => Element | undefined,
) {
  const follow = (event: MouseEvent) => {
    const link = isElement(event.target) ? event.target.closest('a[href^="#"]') : null;
    if (!link || !element.contains(link) || !ordinary(event)) return;
    const id = fragmentTarget(link.getAttribute('href') ?? '', pageOf);
    const index = id === undefined ? undefined : pageOf.get(id);
    if (id === undefined || index === undefined) return;
    event.preventDefault();
    show({ index, id })?.scrollIntoView({ block: 'start' });
  };
  element.addEventListener('click', follow);
  return () => element.removeEventListener('click', follow);
}

// The element of a page that has an id, searched for in that page alone.
function anchorIn(sheet: Element | undefined, id: string): Element | undefined {
  return sheet ? [...sheet.querySelectorAll('[id]')].find((each) => each.id === id) : undefined;
}

// Calls back with true while the host page prints, from the print events and the print media
// query, which a print emulated without the events also changes; and with false once it is done.
function watchPrinting(element: HTMLElement, onChange: (printing: boolean) => void) {
  const view = element.ownerDocument.defaultView;
  if (!view) return () => undefined;
  const query = typeof view.matchMedia === 'function' ? view.matchMedia('print') : null;
  let events = false;
  const report = () => onChange(events || Boolean(query?.matches));
  const before = () => {
    events = true;
    report();
  };
  const after = () => {
    events = false;
    report();
  };
  view.addEventListener('beforeprint', before);
  view.addEventListener('afterprint', after);
  query?.addEventListener('change', report);
  // A viewer mounted while the page already prints, as a print tool that sets the media first does.
  if (query?.matches) report();
  return () => {
    view.removeEventListener('beforeprint', before);
    view.removeEventListener('afterprint', after);
    query?.removeEventListener('change', report);
  };
}

// Draws page content on demand, leaving sheets and previously drawn neighbours in place.
function drawSheets(
  sheets: readonly HTMLElement[],
  pages: ReturnType<typeof drawLayoutPages>['sections'][number]['pages'],
) {
  const drawn = new Set<number>();
  const mount = (index: number) => {
    const sheet = sheets[index];
    const page = pages[index];
    if (!sheet || !page || drawn.has(index)) return;
    sheet.innerHTML = page.html();
    sheet.setAttribute('data-drawn', 'true');
    drawn.add(index);
  };
  return (wanted: ReadonlySet<number> | null) => {
    if (!wanted) {
      if (drawn.size < sheets.length) sheets.forEach((_sheet, index) => mount(index));
      return;
    }
    for (const index of drawn) {
      if (wanted.has(index)) continue;
      const sheet = sheets[index];
      sheet?.replaceChildren();
      sheet?.removeAttribute('data-drawn');
      drawn.delete(index);
    }
    for (const index of wanted) mount(index);
  };
}

function mountViewerPages(
  element: HTMLElement,
  { sections }: ReturnType<typeof drawLayoutPages>,
  overscan: number,
) {
  element.innerHTML = sheetsHtml(sections);
  const pages = sections.flatMap((section) => section.pages);
  const sheets = [...element.querySelectorAll<HTMLElement>(':scope > * > .pm-page')];
  const indexOf = new Map<Element, number>(sheets.map((sheet, index) => [sheet, index]));
  const visible = new Set<number>();
  const draw = drawSheets(sheets, pages);
  let destination: number | undefined;
  let printing = false;
  const redraw = () => {
    if (printing || overscan === Infinity || !observer) draw(null);
    else {
      const near = destination === undefined ? visible : [...visible, destination];
      draw(wantedPages(near, overscan, pages.length));
    }
  };
  const observer = watchNearbySheets(element, sheets, (entries) => {
    let changed = false;
    for (const { target, isIntersecting } of entries) {
      const index = indexOf.get(target);
      if (index === undefined) continue;
      changed ||= visible.has(index) !== isIntersecting || destination === index;
      if (isIntersecting) visible.add(index);
      else visible.delete(index);
      if (destination === index) destination = undefined;
    }
    if (changed) redraw();
  });
  redraw();
  const pageOf = new Map(pages.flatMap((page, index) => page.anchors.map((id) => [id, index])));
  const unfollow = followLinks(element, pageOf, ({ index, id }) => {
    destination = index;
    redraw();
    const sheet = sheets[index];
    if (sheet) observer?.refresh(sheet);
    return anchorIn(sheet, id);
  });
  const unwatch = watchPrinting(element, (now) => {
    if (printing === now) return;
    printing = now;
    redraw();
  });
  return () => {
    unwatch();
    unfollow();
    observer?.disconnect();
    element.replaceChildren();
  };
}

/**
 * A document's laid-out pages, read-only (DOCE-PAGINATION-13.6): `de-document-viewer` beside the
 * editor's root class, in the template's properties, around an element with the classes of the
 * editor's view, holding every section and page sheet; a page near the viewport is drawn
 * (`data-drawn`) with the numbers the engine laid it out with.
 */
export function DocumentViewer(props: DocumentViewerProps) {
  const { layout, template, overscan: requestedOverscan = 1, label, className } = props;
  const overscan = Math.max(0, Math.floor(requestedOverscan || 0));
  const options = useSameOptions(props.options);
  const content = useRef<HTMLDivElement>(null);
  const drawnTemplate = useViewerFonts(template, layout.fonts, content);
  const drawing = useMemo(
    () => drawLayoutPages(layout, drawnTemplate, options),
    [layout, drawnTemplate, options],
  );
  const style = useMemo(() => templateProperties(drawing.template) as CSSProperties, [drawing]);
  useEffect(() => {
    const element = content.current;
    return element ? mountViewerPages(element, drawing, overscan) : undefined;
  }, [drawing, overscan]);
  return (
    <div
      {...hooks.root({
        className: className ? `${EDITOR_CLASS} ${className}` : EDITOR_CLASS,
        data: { mode: 'reading', markup: layout.markup, layout: 'page' },
      })}
      data-text-layout="pretext"
      // The language the pages were laid out in, whatever the host's page is in; empty for none,
      // as around the editor's pages (DOCE-PAGINATION-9.7).
      lang={layout.language}
      role="document"
      aria-label={label}
      style={style}
    >
      <div ref={content} className={VIEW_CLASSES} />
    </div>
  );
}
