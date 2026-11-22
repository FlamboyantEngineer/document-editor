// The read-only viewer of a document's laid-out pages (DOCE-PAGINATION-13.6): the layout the editor
// handed over (`PagesLayout`) drawn as the print drawn from it draws it, every forced block on its
// computed lines, without an editor, a measuring view or a layout of its own. Every page is an
// empty sheet of its section's size until it nears the viewport, so a long document keeps few
// elements, and a page drawn starts its numbering counters where the pages before it leave them.

import { type CSSProperties, useEffect, useMemo, useRef } from 'react';
import type { PagesLayout } from '../../document/pages-layout.js';
import type { PrintPageOptions } from '../../document/print.js';
import { drawLayoutPages, VIEW_CLASSES } from '../../document/print-pages.js';
import { printElement, printHtml } from '../../document/print-tree.js';
import {
  numberingCountersAt,
  numberingCounterValues,
  type TemplateFile,
  templateProperties,
} from '../../model/index.js';
import { createHooks } from '../../utils/hooks.js';

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

/**
 * A document's laid-out pages, read-only (DOCE-PAGINATION-13.6): `de-document-viewer` beside the
 * editor's root class, in the template's properties, around an element with the classes of the
 * editor's view, holding every section and page sheet; a page near the viewport is drawn
 * (`data-drawn`) with its counters, `--de-page-counters`, from where the pages before it leave
 * them.
 */
export function DocumentViewer(props: DocumentViewerProps) {
  const { layout, template, options, overscan = 1, label, className } = props;
  const content = useRef<HTMLDivElement>(null);
  const drawing = useMemo(
    () => drawLayoutPages(layout, template, options),
    [layout, template, options],
  );
  const style = useMemo(() => templateProperties(template) as CSSProperties, [template]);
  useEffect(() => {
    const element = content.current;
    if (!element) return undefined;
    element.innerHTML = sheetsHtml(drawing.sections);
    const pages = drawing.sections.flatMap((section) => section.pages);
    const sheets = [...element.querySelectorAll<HTMLElement>(':scope > * > .pm-page')];
    const visible = new Set<number>();
    const draw = () => {
      const wanted = wantedPages(visible, overscan, pages.length);
      sheets.forEach((sheet, index) => {
        const page = pages[index];
        if (!page || wanted.has(index) === sheet.hasAttribute('data-drawn')) return;
        if (!wanted.has(index)) {
          sheet.replaceChildren();
          sheet.removeAttribute('data-drawn');
          sheet.style.removeProperty('--de-page-counters');
          return;
        }
        const counters = numberingCountersAt(drawing.doc, template, page.pos);
        sheet.style.setProperty('--de-page-counters', numberingCounterValues(counters));
        sheet.innerHTML = page.html;
        sheet.setAttribute('data-drawn', 'true');
      });
    };
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const index = sheets.indexOf(entry.target as HTMLElement);
        if (entry.isIntersecting) visible.add(index);
        else visible.delete(index);
      }
      draw();
    });
    for (const sheet of sheets) observer.observe(sheet);
    draw();
    return () => {
      observer.disconnect();
      element.replaceChildren();
    };
  }, [drawing, template, overscan]);
  return (
    <div
      {...hooks.root({
        className: className ? `${EDITOR_CLASS} ${className}` : EDITOR_CLASS,
        data: { mode: 'reading', markup: options?.markup ?? 'all', layout: 'page' },
      })}
      data-text-layout="pretext"
      role="document"
      aria-label={label}
      style={style}
    >
      <div ref={content} className={VIEW_CLASSES} />
    </div>
  );
}
