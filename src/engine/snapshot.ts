// A snapshot of the document as its pages show it, as a standalone HTML document a host prints or
// turns into a PDF: the laid-out pages without the editor's editing state, the template's custom
// properties, each page's size for print, and the host's stylesheets.

import type { EditorView } from 'prosemirror-view';
import { type TemplateFile, templatePageMetrics, templateProperties } from '../model/index.js';

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

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The document's pages as markup, without the editing state.
function pagesMarkup(view: EditorView): string {
  const copy = view.dom.cloneNode(true) as HTMLElement;
  for (const element of copy.querySelectorAll(EDITING_ELEMENTS)) {
    if (!element.parentElement?.closest(VALUE_HOLDER)) element.remove();
  }
  for (const element of [copy, ...copy.querySelectorAll('*')]) {
    for (const name of EDITING_ATTRIBUTES) element.removeAttribute(name);
  }
  copy.classList.remove('ProseMirror-focused');
  return copy.outerHTML;
}

// The editor root's hooks around the pages, so stylesheets scoped to the editor style them too;
// the snapshot is read, never edited.
function rootMarkup(view: EditorView, pages: string): string {
  const root = view.dom.closest(`.${ROOT_CLASS}`);
  const data = [...(root?.attributes ?? [])]
    .filter(({ name }) => name.startsWith('data-') && name !== 'data-mode')
    .map(({ name, value }) => ` ${name}="${escapeHtml(value)}"`)
    .join('');
  return `<div class="${ROOT_CLASS}" data-mode="reading"${data}>${pages}</div>`;
}

/**
 * The document as its pages show it now, as a standalone HTML document: each page printed on a
 * sheet of its size, in the template's properties, styled by the host's stylesheets.
 */
export function documentSnapshot(view: EditorView, options: SnapshotOptions): string {
  const { width, height } = templatePageMetrics(options.template);
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
    `<style>@page { size: ${String(width)}px ${String(height)}px; margin: 0; } :root { ${properties} } .pm-page { break-after: page; }</style>`,
    links,
    styles,
    '</head><body class="de-snapshot">',
    rootMarkup(view, pagesMarkup(view)),
    '</body></html>',
  ].join('');
}
