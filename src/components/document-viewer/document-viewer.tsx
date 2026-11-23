// The read-only viewer of a document's laid-out pages (DOCE-PAGINATION-13.6): the layout the editor
// handed over (`PagesLayout`) drawn as the print drawn from it draws it, every forced block on its
// computed lines, without an editor, a measuring view or a layout of its own. Every page is an
// empty sheet of its section's size until it nears the viewport, so a long document keeps few
// elements, and every number is the one the engine laid the pages out with, whichever pages are
// drawn.

import { type CSSProperties, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { registerFaces } from '../../document/font-registry.js';
import type { PagesLayout } from '../../document/pages-layout.js';
import type { PrintPageOptions } from '../../document/print.js';
import { drawLayoutPages, layoutTemplate, VIEW_CLASSES } from '../../document/print-pages.js';
import { printElement, printHtml } from '../../document/print-tree.js';
import type { FontFiles } from '../../host/font-files.js';
import { type TemplateFile, templateProperties } from '../../model/index.js';
import { renameTemplateFonts } from '../../pagination/served-template.js';
import { createHooks } from '../../utils/hooks.js';
import { isElement } from '../../utils/is-element.js';
import { scrollerOf } from '../../utils/scroll-frame.js';

const hooks = createHooks('document-viewer');

// The editor's root class, which the document's stylesheets style its pages under.
const EDITOR_CLASS = 'de-document-editor';

export interface DocumentViewerProps {
  /** The pages' layout, from the editor handle's `pagesLayout()`. */
  layout: PagesLayout;
  /** The template the pages were laid out under. */
  template: TemplateFile;
  /** How suggestions show, links and the document kit, as for `renderLayoutPrintPage`. */
  options?: Omit<PrintPageOptions, 'title' | 'styles' | 'stylesheets'> | undefined;
  /** How many pages before and after the ones in view are drawn; `Infinity` draws them all. */
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

/**
 * How far beyond the viewer's scrolling frame a sheet counts as in view: a screen above and below,
 * so a fast scroll finds the next pages drawn.
 */
const NEAR = '100% 0px';

// The area the margin applies to: the viewer's scrolling ancestor, whose clip would otherwise cut
// the margin off; the window when the document scrolls.
function rootOf(element: Element): Element | null {
  const scroller = scrollerOf(element);
  return scroller === element.ownerDocument.scrollingElement ? null : scroller;
}

// Whether two options objects hold the same value in every field.
function sameFields<T extends object>(one: T | undefined, other: T | undefined): boolean {
  if (one === other) return true;
  if (!one || !other) return false;
  const fields = Object.entries(one);
  return (
    fields.length === Object.keys(other).length &&
    fields.every(([key, value]) => Object.is((other as Record<string, unknown>)[key], value))
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
function wantedPages(visible: ReadonlySet<number>, overscan: number, total: number): Set<number> {
  if (overscan === Infinity) return new Set(Array.from({ length: total }, (_, index) => index));
  const wanted = new Set<number>();
  for (const index of visible) {
    const from = Math.max(0, index - overscan);
    const to = Math.min(total - 1, index + overscan);
    for (let page = from; page <= to; page += 1) wanted.add(page);
  }
  return wanted;
}

// The served faces the pages were measured with, added to the viewer's document while it shows
// them, so its pages draw the glyphs their lines were broken in (DOCE-PAGINATION-13.8); and the
// family the viewer draws each served family under: another one when another surface of the
// document draws other files under it (DOCE-PAGINATION-12.8).
function useLayoutFaces(
  fonts: FontFiles | null,
  root: RefObject<HTMLElement | null>,
): (family: string) => string {
  const [drawn, setDrawn] = useState<{
    readonly fonts: FontFiles | null;
    readonly family: (family: string) => string;
  }>({ fonts: null, family: sameFamily });
  useEffect(() => {
    const doc = root.current?.ownerDocument;
    if (!doc) return undefined;
    const registration = registerFaces(doc, fonts);
    let released = false;
    // Only a viewer drawing a family under another name draws its pages again.
    if (registration.renamed)
      void registration.loaded.then(() => {
        if (!released) setDrawn({ fonts, family: registration.drawnFamily });
      });
    return () => {
      released = true;
      registration.release();
    };
  }, [fonts, root]);
  return drawn.fonts === fonts ? drawn.family : sameFamily;
}

const sameFamily = (family: string) => family;

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
// contents row): the page holding it is drawn as if in view, though it was not drawn, and the
// anchor scrolled to (DOCE-PAGINATION-13.9). A modified click is left to the browser.
function followLinks(
  element: HTMLElement,
  pageOf: ReadonlyMap<string, number>,
  show: (index: number) => void,
) {
  const follow = (event: MouseEvent) => {
    const link = isElement(event.target) ? event.target.closest('a[href^="#"]') : null;
    if (!link || !element.contains(link) || !ordinary(event)) return;
    const id = fragmentTarget(link.getAttribute('href') ?? '', pageOf);
    const index = id === undefined ? undefined : pageOf.get(id);
    if (index === undefined) return;
    event.preventDefault();
    show(index);
    const target = [...element.querySelectorAll('[id]')].find((each) => each.id === id);
    target?.scrollIntoView({ block: 'start' });
  };
  element.addEventListener('click', follow);
  return () => element.removeEventListener('click', follow);
}

/**
 * A document's laid-out pages, read-only (DOCE-PAGINATION-13.6): `de-document-viewer` beside the
 * editor's root class, in the template's properties, around an element with the classes of the
 * editor's view, holding every section and page sheet; a page near the viewport is drawn
 * (`data-drawn`) with the numbers the engine laid it out with.
 */
export function DocumentViewer(props: DocumentViewerProps) {
  const { layout, template, overscan = 1, label, className } = props;
  const options = useSameOptions(props.options);
  const content = useRef<HTMLDivElement>(null);
  const drawnFamily = useLayoutFaces(layout.fonts, content);
  // The template as the viewer draws it: each served family under the family it draws it in.
  const drawn = useMemo(
    () => renameTemplateFonts(layoutTemplate(layout, template), drawnFamily),
    [layout, template, drawnFamily],
  );
  const drawing = useMemo(() => drawLayoutPages(layout, drawn, options), [layout, drawn, options]);
  const style = useMemo(() => templateProperties(drawn) as CSSProperties, [drawn]);
  useEffect(() => {
    const element = content.current;
    if (!element) return undefined;
    element.innerHTML = sheetsHtml(drawing.sections);
    const pages = drawing.sections.flatMap((section) => section.pages);
    const sheets = [...element.querySelectorAll<HTMLElement>(':scope > * > .pm-page')];
    const indexOf = new Map<Element, number>(sheets.map((sheet, index) => [sheet, index]));
    const visible = new Set<number>();
    const draw = () => {
      const wanted = wantedPages(visible, overscan, pages.length);
      sheets.forEach((sheet, index) => {
        const page = pages[index];
        if (!page || wanted.has(index) === sheet.hasAttribute('data-drawn')) return;
        if (!wanted.has(index)) {
          sheet.replaceChildren();
          sheet.removeAttribute('data-drawn');
          return;
        }
        sheet.innerHTML = page.html();
        sheet.setAttribute('data-drawn', 'true');
      });
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = indexOf.get(entry.target) ?? -1;
          if (entry.isIntersecting) visible.add(index);
          else visible.delete(index);
        }
        draw();
      },
      { root: rootOf(element), rootMargin: NEAR },
    );
    for (const sheet of sheets) observer.observe(sheet);
    draw();
    const pageOf = new Map(pages.flatMap((page, index) => page.anchors.map((id) => [id, index])));
    const unfollow = followLinks(element, pageOf, (index) => {
      visible.add(index);
      draw();
    });
    return () => {
      unfollow();
      observer.disconnect();
      element.replaceChildren();
    };
  }, [drawing, overscan]);
  return (
    <div
      {...hooks.root({
        className: className ? `${EDITOR_CLASS} ${className}` : EDITOR_CLASS,
        data: { mode: 'reading', markup: options?.markup ?? 'all', layout: 'page' },
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
