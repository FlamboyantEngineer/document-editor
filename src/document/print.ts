// A static render of a stored document as a standalone HTML page, without an editor or a DOM, such
// as a server's preview, an email or a fallback print: the document as its schema renders it, in
// its template's properties and headers and footers, each section on its template sheet with the
// template's margins, and the links, numbers, images and allow-list a print snapshot keeps. Nothing
// is laid out on pages, so the browser breaks the pages and each section's header and footer show
// once, at its start and end.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { elementNumbers } from '../engine/print-links.js';
import {
  createDocumentSchema,
  type DocumentFile,
  type DocumentKitOptions,
  findTemplateSection,
  readDocumentFile,
  setPageRegions,
  type TemplateFile,
  templatePageMetrics,
} from '../model/index.js';
import {
  addLinks,
  allow,
  drawNode,
  numberFootnotes,
  type PrintLinkOptions,
  type PrintMarkup,
  standalonePage,
} from './print-content.js';
import { nodeTree, printElement, type PrintTree } from './print-tree.js';

/** What a static render holds beside the document. */
export interface PrintPageOptions extends PrintLinkOptions {
  /** The page's title. */
  readonly title?: string | undefined;
  /** The stylesheets that style the document, as CSS text, inlined in order. */
  readonly styles?: readonly string[] | undefined;
  /** The stylesheets that style the document, by address, linked in order. */
  readonly stylesheets?: readonly string[] | undefined;
  /** How suggestions show: all their markup (the default), as if accepted, or as if rejected. */
  readonly markup?: PrintMarkup | undefined;
  /** The host's schema choices and extensions, such as where file assets are previewed. */
  readonly kit?: DocumentKitOptions | undefined;
}

/** The editor root's hook class, which a static render's root carries too. */
export const ROOT_CLASS = 'de-document-editor';

// Each section's sheet, with the template's margins, since no page box holds them here.
function sheetRules(doc: ProseMirrorNode, template: TemplateFile): string {
  const rules: string[] = [];
  let index = 0;
  doc.forEach((node) => {
    if (node.type.name !== 'page_section') return;
    const scope = findTemplateSection(template, node.attrs.sectionName as string | null);
    const { width, height, margins } = templatePageMetrics(template, scope);
    const margin = [margins.top, margins.right, margins.bottom, margins.left]
      .map((value) => `${String(value)}px`)
      .join(' ');
    const name = `de-static-${String(index)}`;
    rules.push(
      `@page ${name} { size: ${String(width)}px ${String(height)}px; margin: ${margin}; }`,
      `.de-static > .${ROOT_CLASS} > :nth-child(${String(index + 1)} of .pm-section) { page: ${name}; }`,
    );
    index += 1;
  });
  return rules.join(' ');
}

/**
 * A stored document as a standalone HTML page, without an editor or a DOM: rendered by its
 * schema in its template, with print's links, numbers, images and allow-list, each section on its
 * sheet; nothing is laid out on pages, so the browser breaks them.
 */
export function renderPrintPage(
  file: DocumentFile,
  template: TemplateFile,
  options: PrintPageOptions = {},
): string {
  const schema = createDocumentSchema(options.kit);
  // The template's headers and footers, and the footnotes numbered in order, as the editor shows.
  const { doc } = setPageRegions(
    EditorState.create({ doc: readDocumentFile(file, schema).doc }).tr,
    template,
  );
  const trees: PrintTree[] = [];
  doc.forEach((node, offset) => trees.push(...nodeTree(node, { draw: drawNode }, { at: offset })));
  numberFootnotes(trees, doc);
  addLinks(trees, elementNumbers(doc, template), options);
  const markup = options.markup ?? 'all';
  const root = printElement(
    'div',
    { class: ROOT_CLASS, 'data-mode': 'reading', 'data-markup': markup, 'data-print': 'true' },
    allow(trees, markup),
  );
  return standalonePage(root, {
    ...options,
    template,
    bodyClass: 'de-static',
    rules: [
      sheetRules(doc, template),
      '.de-static a[data-print-link] { color: inherit; text-decoration: inherit; }',
      // Unlaid, a section's content flows over as many sheets as it takes, inside the @page margins.
      '.de-static .pm-page { width: auto !important; height: auto !important; min-height: 0 !important;',
      ' padding: 0 !important; margin: 0 !important; overflow: visible !important; }',
      '.de-static .pm-section { break-before: page; } .de-static .pm-section:first-child { break-before: auto; }',
    ],
  });
}
