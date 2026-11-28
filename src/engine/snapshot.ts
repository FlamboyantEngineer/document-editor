// A snapshot of the document as its pages show it, as a standalone HTML document a host prints or
// turns into a PDF: the laid-out pages without the editor's editing state or view-only
// decorations, the template's custom properties, each section's sheet size for print, and the
// host's stylesheets.

import type { EditorView } from 'prosemirror-view';
import {
  documentLanguage,
  findTemplateSection,
  type TemplateFile,
  templatePageMetrics,
  templateProperties,
} from '../model/index.js';
import type { CitationHref } from '../model/schema/reference-mark.js';
import { copyCodeHighlights } from './code-highlighting.js';
import { allowSnapshotMarkup } from './print-allow-list.js';
import { prepareSnapshotImages, type ResolveImage } from './print-images.js';
import { addPrintLinks, elementNumbers, PRINT_LINK_ATTRIBUTE } from './print-links.js';
import {
  applySuggestionMarkup,
  editorMarkup,
  isViewStateAttribute,
  PRINT_MARKER_RULES,
  removeViewOnlyDecorations,
  type SnapshotMarkup,
} from './print-view.js';

/** What a snapshot holds beside the pages. */
export interface SnapshotOptions {
  /** The resolved template the pages are laid out in. */
  readonly template: TemplateFile;
  /** The snapshot's title. */
  readonly title?: string | undefined;
  /** The stylesheets that style the pages, as CSS text, inlined in order. */
  readonly styles?: readonly string[] | undefined;
  /** The stylesheets that style the pages, by address, linked in order. */
  readonly stylesheets?: readonly string[] | undefined;
  /** How suggestions show; by default as the editor shows them, its simple markup as `final`. */
  readonly markup?: SnapshotMarkup | undefined;
  /** Where a citation of another document links; by default the host's `references.href`. */
  readonly citationHref?: CitationHref | undefined;
  /** The address each image prints from, given the one the pages show; by default that one. */
  readonly resolveImage?: ResolveImage | undefined;
}

// The editing state a snapshot leaves out: attributes and the elements only an editor draws.
// Widgets are content, such as a variable's value or a comparison's deleted text, unless they
// are view-only.
const EDITING_ATTRIBUTES = [
  'contenteditable',
  'spellcheck',
  'draggable',
  'tabindex',
  'data-canvas-fallback',
  'drawable',
];
const EDITING_ELEMENTS = '.ProseMirror-gapcursor, .ProseMirror-separator';
const ROOT_CLASS = 'de-document-editor';
const SHEET_ATTRIBUTE = 'data-print-sheet';

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A print sheet's size, as `@page` takes it.
const sheetSize = ({ width, height }: { width: number; height: number }) =>
  `${String(width)}px ${String(height)}px`;

// Each section's sheet: the sizes the sections print on, in order of first use, and for each
// section the index of its size.
function sectionSheets(view: EditorView, template: TemplateFile) {
  const sizes: string[] = [];
  const sections: number[] = [];
  view.state.doc.forEach((node) => {
    if (node.type.name !== 'page_section') return;
    const scope = findTemplateSection(template, node.attrs.sectionName as string | null);
    const size = sheetSize(templatePageMetrics(template, scope));
    if (!sizes.includes(size)) sizes.push(size);
    sections.push(sizes.indexOf(size));
  });
  return { sizes, sections };
}

// The print rules: the template's sheet for the whole snapshot, a named sheet for each size its
// sections print on, a sheet break after every page but the last, and, in print, the pages edge
// to edge, with none of the space a stylesheet puts around and between them on screen.
function printRules(template: TemplateFile, sizes: readonly string[]): string {
  const named = sizes.map((size, index) => {
    const name = `de-sheet-${String(index)}`;
    return `@page ${name} { size: ${size}; margin: 0; } .pm-section[${SHEET_ATTRIBUTE}="${String(index)}"] { page: ${name}; }`;
  });
  return [
    `@page { size: ${sheetSize(templatePageMetrics(template))}; margin: 0; }`,
    ...named,
    '.pm-page { break-after: page; }',
    '.pm-section:last-child > .pm-page:last-child { break-after: auto; }',
    '@media print { body.de-snapshot { margin: 0; } .de-snapshot :is(.pm-section, .pm-page) { margin: 0 !important; gap: 0 !important; } }',
    `.de-snapshot a[${PRINT_LINK_ATTRIBUTE}] { color: inherit; text-decoration: inherit; }`,
    ':root { color-scheme: light; } .de-snapshot, .de-snapshot * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }',
    PRINT_MARKER_RULES,
  ].join(' ');
}

// The document's pages as markup, without the editing state or view-only decorations, with the
// code highlights the view paints, the suggestions the markup shows and the links print keeps.
function copyPages(
  view: EditorView,
  options: SnapshotOptions & { readonly markup: SnapshotMarkup },
): HTMLElement {
  const copy = view.dom.cloneNode(true) as HTMLElement;
  copyCodeHighlights(view, copy);
  // A page painted into a canvas (DOCE-EDITOR-1.9) is copied as its HTML, without the canvas.
  for (const wrapper of copy.querySelectorAll('.de-document-editor__canvas-page')) {
    const page = wrapper.querySelector('.pm-page');
    if (page) wrapper.replaceWith(page);
  }
  for (const element of copy.querySelectorAll(EDITING_ELEMENTS)) element.remove();
  removeViewOnlyDecorations(copy, view);
  applySuggestionMarkup(copy, options.markup);
  addPrintLinks(copy, {
    numbers: elementNumbers(view.state.doc, options.template),
    href: options.citationHref,
  });
  return copy;
}

// The language the pages are laid out in, the document's own, else its template's
// (DOCE-PAGINATION-9.16), which picks their fonts' fallbacks, hyphenation and quotes; never the
// host page's.
function languageAttribute(view: EditorView, template: TemplateFile): string {
  return ` lang="${escapeHtml(documentLanguage(view.state.doc, template))}"`;
}

// The editor root's hooks around the pages, so stylesheets scoped to the editor style them too,
// without the ones that describe the view; the snapshot is read, never edited, shows the markup
// it was made with, and is marked as print (`data-print`) for a stylesheet's print overrides.
function rootTag(view: EditorView, markup: SnapshotMarkup): string {
  const root = view.dom.closest(`.${ROOT_CLASS}`);
  const data = [...(root?.attributes ?? [])]
    .filter(({ name }) => name.startsWith('data-') && !isViewStateAttribute(name))
    .filter(({ name }) => name !== 'data-markup' && name !== 'data-print')
    .map(({ name, value }) => ` ${name}="${escapeHtml(value)}"`)
    .join('');
  const hooks = `data-mode="reading" data-markup="${markup}" data-print="true"`;
  return `<div class="${ROOT_CLASS}" ${hooks}${data}>`;
}

interface CapturedSnapshot {
  readonly pages: HTMLElement;
  html(resolveImage?: ResolveImage): string;
}

/** Captures the printed pages and their styles before a host can change the live view. */
export function captureDocumentSnapshot(
  view: EditorView,
  options: SnapshotOptions,
): CapturedSnapshot {
  const { sizes, sections } = sectionSheets(view, options.template);
  const markup = options.markup ?? editorMarkup(view);
  const properties = Object.entries(templateProperties(options.template))
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ');
  const links = (options.stylesheets ?? [])
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
    .join('');
  const styles = (options.styles ?? []).map((css) => `<style>${css}</style>`).join('');
  const pages = copyPages(view, { ...options, markup });
  const opening = [
    '<!doctype html>',
    `<html${languageAttribute(view, options.template)}><head><meta charset="utf-8">`,
    `<title>${escapeHtml(options.title ?? '')}</title>`,
    `<style>${printRules(options.template, sizes)} :root { ${properties} }</style>`,
    links,
    styles,
    '</head><body class="de-snapshot">',
    rootTag(view, markup),
  ].join('');
  return {
    pages,
    html(resolveImage) {
      prepareSnapshotImages(pages, resolveImage);
      allowSnapshotMarkup(pages);
      for (const [index, element] of pages.querySelectorAll(':scope > .pm-section').entries())
        element.setAttribute(SHEET_ATTRIBUTE, String(sections[index] ?? 0));
      for (const element of [pages, ...pages.querySelectorAll('*')]) {
        for (const name of EDITING_ATTRIBUTES) element.removeAttribute(name);
      }
      pages.classList.remove('ProseMirror-focused');
      return `${opening}${pages.outerHTML}</div></body></html>`;
    },
  };
}

/**
 * The document as its pages show it now, as a standalone HTML document: each page printed on its
 * section's sheet size, in the template's properties, styled by the host's stylesheets.
 */
export function documentSnapshot(view: EditorView, options: SnapshotOptions): string {
  return captureDocumentSnapshot(view, options).html(options.resolveImage);
}
