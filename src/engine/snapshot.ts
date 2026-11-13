// A snapshot of the document as its pages show it, as a standalone HTML document a host prints or
// turns into a PDF: the laid-out pages without the editor's editing state or view-only
// decorations, the template's custom properties, each section's sheet size for print, and the
// host's stylesheets.

import type { EditorView } from 'prosemirror-view';
import {
  findTemplateSection,
  type TemplateFile,
  templatePageMetrics,
  templateProperties,
} from '../model/index.js';
import type { CitationHref } from '../model/schema/reference-mark.js';
import { copyCodeHighlights } from './code-highlighting.js';
import { addPrintLinks, elementNumbers, PRINT_LINK_ATTRIBUTE } from './print-links.js';
import {
  applySuggestionMarkup,
  editorMarkup,
  isViewStateAttribute,
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
}

// The editing state a snapshot leaves out: attributes and the elements only an editor draws.
// Widgets are content, such as a variable's value or a comparison's deleted text, unless they
// are view-only.
const EDITING_ATTRIBUTES = ['contenteditable', 'spellcheck', 'draggable', 'tabindex'];
const EDITING_ELEMENTS = '.ProseMirror-gapcursor, .ProseMirror-separator';
const ROOT_CLASS = 'de-document-editor';
const SHEET_ATTRIBUTE = 'data-print-sheet';
// The inherited text properties a snapshot takes from around the editor's pages.
const INHERITED_TEXT = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'color',
];

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
  ].join(' ');
}

// The document's pages as markup, without the editing state or view-only decorations, with the
// code highlights the view paints, the suggestions the markup shows and the links print keeps,
// each section marked with its sheet.
function pagesMarkup(
  view: EditorView,
  options: SnapshotOptions & { readonly sections: readonly number[]; markup: SnapshotMarkup },
): string {
  const { sections, markup } = options;
  const copy = view.dom.cloneNode(true) as HTMLElement;
  copyCodeHighlights(view, copy);
  for (const element of copy.querySelectorAll(EDITING_ELEMENTS)) element.remove();
  removeViewOnlyDecorations(copy, view);
  applySuggestionMarkup(copy, markup);
  addPrintLinks(copy, {
    numbers: elementNumbers(view.state.doc, options.template),
    href: options.citationHref,
  });
  for (const [index, element] of copy.querySelectorAll(':scope > .pm-section').entries()) {
    element.setAttribute(SHEET_ATTRIBUTE, String(sections[index] ?? 0));
  }
  for (const element of [copy, ...copy.querySelectorAll('*')]) {
    for (const name of EDITING_ATTRIBUTES) element.removeAttribute(name);
  }
  copy.classList.remove('ProseMirror-focused');
  return copy.outerHTML;
}

// The language the pages are shown in, the closest one around them, which picks their fonts'
// fallbacks, hyphenation and quotes; none when nothing around them names one.
function languageAttribute(view: EditorView): string {
  const language = view.dom.closest('[lang]')?.getAttribute('lang');
  return language ? ` lang="${escapeHtml(language)}"` : '';
}

// The text style the pages inherit in the editor, from the page it is on, so text the template
// and stylesheets leave unstyled prints as it shows there rather than in the browser's default.
function inheritedText(view: EditorView): string {
  const around = view.dom.parentElement;
  const computed = around && view.dom.ownerDocument.defaultView?.getComputedStyle(around);
  if (!computed) return '';
  return INHERITED_TEXT.map((name) => [name, computed.getPropertyValue(name)] as const)
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ');
}

// The editor root's hooks around the pages, so stylesheets scoped to the editor style them too,
// without the ones that describe the view; the snapshot is read, never edited, shows the markup
// it was made with, and is marked as print (`data-print`) for a stylesheet's print overrides.
function rootMarkup(view: EditorView, pages: string, markup: SnapshotMarkup): string {
  const root = view.dom.closest(`.${ROOT_CLASS}`);
  const data = [...(root?.attributes ?? [])]
    .filter(({ name }) => name.startsWith('data-') && !isViewStateAttribute(name))
    .filter(({ name }) => name !== 'data-markup' && name !== 'data-print')
    .map(({ name, value }) => ` ${name}="${escapeHtml(value)}"`)
    .join('');
  const hooks = `data-mode="reading" data-markup="${markup}" data-print="true"`;
  const style = escapeHtml(inheritedText(view));
  return `<div class="${ROOT_CLASS}" ${hooks}${data} style="${style}">${pages}</div>`;
}

/**
 * The document as its pages show it now, as a standalone HTML document: each page printed on its
 * section's sheet size, in the template's properties, styled by the host's stylesheets.
 */
export function documentSnapshot(view: EditorView, options: SnapshotOptions): string {
  const { sizes, sections } = sectionSheets(view, options.template);
  const markup = options.markup ?? editorMarkup(view);
  const properties = Object.entries(templateProperties(options.template))
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ');
  const links = (options.stylesheets ?? [])
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
    .join('');
  const styles = (options.styles ?? []).map((css) => `<style>${css}</style>`).join('');
  return [
    '<!doctype html>',
    `<html${languageAttribute(view)}><head><meta charset="utf-8">`,
    `<title>${escapeHtml(options.title ?? '')}</title>`,
    `<style>${printRules(options.template, sizes)} :root { ${properties} }</style>`,
    links,
    styles,
    '</head><body class="de-snapshot">',
    rootMarkup(view, pagesMarkup(view, { ...options, sections, markup }), markup),
    '</body></html>',
  ].join('');
}
