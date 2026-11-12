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
import { isViewStateAttribute, removeViewOnlyDecorations } from './print-view.js';

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
}

// The editing state a snapshot leaves out: attributes and the elements only an editor draws. A
// widget inside a variable is content, not editing state: it shows the variable's value.
const EDITING_ATTRIBUTES = ['contenteditable', 'spellcheck', 'draggable', 'tabindex'];
const EDITING_ELEMENTS = '.ProseMirror-widget, .ProseMirror-gapcursor, .ProseMirror-separator';
const VALUE_HOLDER = '[data-template-variable]';
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
  ].join(' ');
}

// The document's pages as markup, without the editing state or view-only decorations, each
// section marked with its sheet.
function pagesMarkup(view: EditorView, sections: readonly number[]): string {
  const copy = view.dom.cloneNode(true) as HTMLElement;
  for (const element of copy.querySelectorAll(EDITING_ELEMENTS)) {
    if (!element.parentElement?.closest(VALUE_HOLDER)) element.remove();
  }
  removeViewOnlyDecorations(copy, view);
  for (const [index, element] of copy.querySelectorAll(':scope > .pm-section').entries()) {
    element.setAttribute(SHEET_ATTRIBUTE, String(sections[index] ?? 0));
  }
  for (const element of [copy, ...copy.querySelectorAll('*')]) {
    for (const name of EDITING_ATTRIBUTES) element.removeAttribute(name);
  }
  copy.classList.remove('ProseMirror-focused');
  return copy.outerHTML;
}

// The editor root's hooks around the pages, so stylesheets scoped to the editor style them too,
// without the ones that describe the view; the snapshot is read, never edited.
function rootMarkup(view: EditorView, pages: string): string {
  const root = view.dom.closest(`.${ROOT_CLASS}`);
  const data = [...(root?.attributes ?? [])]
    .filter(({ name }) => name.startsWith('data-') && !isViewStateAttribute(name))
    .map(({ name, value }) => ` ${name}="${escapeHtml(value)}"`)
    .join('');
  return `<div class="${ROOT_CLASS}" data-mode="reading"${data}>${pages}</div>`;
}

/**
 * The document as its pages show it now, as a standalone HTML document: each page printed on its
 * section's sheet size, in the template's properties, styled by the host's stylesheets.
 */
export function documentSnapshot(view: EditorView, options: SnapshotOptions): string {
  const { sizes, sections } = sectionSheets(view, options.template);
  const properties = Object.entries(templateProperties(options.template))
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ');
  const links = (options.stylesheets ?? [])
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
    .join('');
  const styles = (options.styles ?? []).map((css) => `<style>${css}</style>`).join('');
  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8">',
    `<title>${escapeHtml(options.title ?? '')}</title>`,
    `<style>${printRules(options.template, sizes)} :root { ${properties} }</style>`,
    links,
    styles,
    '</head><body class="de-snapshot">',
    rootMarkup(view, pagesMarkup(view, sections)),
    '</body></html>',
  ].join('');
}
