// Shows a lab's canonical state on pages, as the document editor does: a read-only projection
// renders the pages in `.lab-pages`, laid out by the layout engine in the labs' served fonts and
// the lab's template, and every edit on the pages goes to the canonical state. The root reports the page count
// (`data-lab-pages`) and that the pages are laid out (`data-lab-ready`) after each layout.

import type { Node } from 'prosemirror-model';
import { BASE_TEMPLATE, type TemplateFile, templatePageMetrics } from '../../src/model/index.js';
import {
  createProjectionView,
  loadPagesFonts,
  PAGE_GENERICS,
  type ProjectionView,
  type ProjectionViewOptions,
  templateFontFamilies,
  type TextLayoutSetting,
} from '../../src/pagination/index.js';
import { LAB_FONTS } from './served-fonts.js';

/** How a lab's pages are set up: a projection view's options, without where it mounts. */
export interface LabPagesOptions extends Omit<ProjectionViewOptions, 'mount'> {
  /** The template the pages are laid out in now; the base template when not given. */
  readonly template?: (() => TemplateFile) | undefined;
  /** Called after each layout, once the root reports it. */
  readonly onLaidOut?: ((pages: ProjectionView) => void) | undefined;
}

/** A template with side margins that leave `width` pixels of content, which the engine lays out in. */
export function templateOfWidth(template: TemplateFile, width: number): TemplateFile {
  const margin = `${String((templatePageMetrics(template).width - width) / 2)}px`;
  const page = template.page ?? {};
  return {
    ...template,
    page: { ...page, margins: { ...page.margins, left: margin, right: margin } },
  };
}

/**
 * The layout engine a lab's projection lays its pages out with: the labs' served fonts
 * (`LAB_FONTS`), for the families `template` names and the generic keywords.
 */
export function labTextLayout(
  template: () => TemplateFile,
  rest: Omit<TextLayoutSetting, 'template' | 'fonts'> = {},
): TextLayoutSetting {
  const families = [...new Set([...templateFontFamilies(template()), ...PAGE_GENERICS])];
  return { ...rest, template, fonts: loadPagesFonts(LAB_FONTS, families, { doc: document }) };
}

const pageCount = (doc: Node) => {
  let count = 0;
  doc.descendants((node) => {
    if (node.type.name === 'page') count += 1;
    return node.type.name === 'doc' || node.type.name === 'page_section';
  });
  return count;
};

/** The lab's mount point for the pages; null when the page lacks one. */
export function labMounts(): { readonly mount: HTMLElement } | null {
  const mount = document.querySelector<HTMLElement>('.lab-pages');
  return mount ? { mount } : null;
}

/** Shows a canonical state on pages in the lab's mount points. */
export function showOnPages(
  mounts: { readonly mount: HTMLElement },
  { onLaidOut, onLayout, template, ...options }: LabPagesOptions,
): ProjectionView {
  let pages: ProjectionView | null = null;
  pages = createProjectionView({
    ...mounts,
    // The pages are laid out from a state with the canonical plugins, as DocumentEditor's are.
    layoutPlugins: options.state.plugins,
    textLayout: labTextLayout(template ?? (() => BASE_TEMPLATE), {
      layoutRules: () => (typeof options.rules === 'object' ? options.rules : undefined),
    }),
    ...options,
    onLayout(tr) {
      onLayout?.(tr);
      const { dataset } = document.documentElement;
      dataset.labPages = String(pageCount(tr.doc));
      dataset.labReady = 'true';
      // The first layout runs while the projection is made.
      if (pages) onLaidOut?.(pages);
      else queueMicrotask(() => pages && onLaidOut?.(pages));
    },
  });
  return pages;
}
