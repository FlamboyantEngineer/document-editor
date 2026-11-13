// A static render of a stored document as a standalone HTML page, without an editor or a DOM, such
// as a server's preview, an email or a fallback print: the document as its schema renders it, in
// its template's properties and headers and footers, each section on its template sheet with the
// template's margins, and the links, numbers, images and allow-list a print snapshot keeps. Nothing
// is laid out on pages, so the browser breaks the pages and each section's header and footer show
// once, at its start and end.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { numberFootnotes } from '../engine/footnote-model.js';
import {
  isAllowedAttribute,
  SNAPSHOT_DROPPED,
  SNAPSHOT_ELEMENTS,
} from '../engine/print-allow-list.js';
import type { ResolveImage } from '../engine/print-images.js';
import { elementNumbers } from '../engine/print-links.js';
import {
  createDocumentSchema,
  type DocumentFile,
  type DocumentKitOptions,
  findTemplateSection,
  readDocumentFile,
  setPageRegions,
  signatureSvgMarkup,
  type TemplateFile,
  templatePageMetrics,
  templateProperties,
} from '../model/index.js';
import { footnoteEntryAnchor, footnoteMarkerAnchor } from '../model/schema/footnote-nodes.js';
import { type CitationHref, referencePrintHref } from '../model/schema/reference-mark.js';
import {
  isPrintElement,
  nodeTree,
  type PrintElement,
  printElement,
  printElements,
  printHtml,
  type PrintTree,
} from './print-tree.js';

/** What a static render holds beside the document. */
export interface PrintPageOptions {
  /** The page's title. */
  readonly title?: string | undefined;
  /** The stylesheets that style the document, as CSS text, inlined in order. */
  readonly styles?: readonly string[] | undefined;
  /** The stylesheets that style the document, by address, linked in order. */
  readonly stylesheets?: readonly string[] | undefined;
  /** How suggestions show: all their markup (the default), as if accepted, or as if rejected. */
  readonly markup?: 'all' | 'final' | 'original' | undefined;
  /** Where a citation of another document links; unlinked without it. */
  readonly citationHref?: CitationHref | undefined;
  /** The address each image loads from, given the one the document names; null keeps it. */
  readonly resolveImage?: ResolveImage | undefined;
  /** The host's schema choices and extensions, such as where file assets are previewed. */
  readonly kit?: DocumentKitOptions | undefined;
}

const ROOT_CLASS = 'de-document-editor';

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A signature draws from its stored vector, as the editor's view draws it.
function drawNode(node: ProseMirrorNode, drawn: PrintTree[]): PrintTree[] {
  if (node.type.name !== 'signature') return drawn;
  const [element] = drawn;
  const svg = signatureSvgMarkup(node.attrs.vector, String(node.attrs.displayName ?? ''));
  if (!element || !isPrintElement(element)) return drawn;
  element.attrs.delete('data-signature-vector');
  const name = printElement('span', { class: 'de-signature__name' }, [
    { text: String(node.attrs.displayName ?? '') },
  ]);
  element.children = [...(svg ? [{ markup: svg }] : []), name];
  return drawn;
}

// Puts a link around an element's content.
function link(element: PrintElement, href: string, kind: string) {
  element.children = [printElement('a', { href, 'data-print-link': kind }, element.children)];
}

// Anchors, numbers, links and images, as a print snapshot has them (DOCE-EDITOR-6.21, 6.22, 6.25).
function addLinks(
  trees: PrintTree[],
  numbers: ReadonlyMap<string, string>,
  options: PrintPageOptions,
) {
  const taken = new Set<string>();
  const anchor = (element: PrintElement, id: string) => {
    if (taken.has(id)) return false;
    taken.add(id);
    element.attrs.set('id', id);
    return true;
  };
  for (const element of printElements(trees)) {
    const { attrs } = element;
    const id = attrs.get('data-id');
    if (id && anchor(element, id) && numbers.has(id))
      attrs.set('data-number', numbers.get(id) ?? '');
    if (attrs.get('data-reference') === 'true') referenceLink(element, options.citationHref);
    const footnote = attrs.get('data-footnote-id');
    if (footnote && attrs.has('data-footnote-reference')) {
      anchor(element, footnoteMarkerAnchor(footnote));
      link(element, `#${footnoteEntryAnchor(footnote)}`, 'footnote');
    } else if (footnote && anchor(element, footnoteEntryAnchor(footnote))) {
      const number = element.children.find(isPrintElement);
      if (number) link(number, `#${footnoteMarkerAnchor(footnote)}`, 'footnote-back');
    }
    if (element.tag === 'img') image(element, options.resolveImage);
  }
}

function referenceLink(element: PrintElement, href: CitationHref | undefined) {
  const refType = element.attrs.get('data-ref-type') ?? 'internal-heading';
  const target = referencePrintHref(
    {
      refType,
      targetId: element.attrs.get('data-target-id'),
      broken: element.attrs.get('data-broken') === 'true',
      referenceBaseline: element.attrs.get('data-reference-baseline'),
    },
    href,
  );
  if (target) link(element, target, refType.startsWith('internal-') ? 'reference' : 'citation');
}

function image(element: PrintElement, resolveImage: ResolveImage | undefined) {
  element.attrs.set('loading', 'eager');
  element.attrs.set('decoding', 'sync');
  const src = element.attrs.get('src');
  const resolved = src && resolveImage ? resolveImage(src) : null;
  if (resolved !== null) element.attrs.set('src', resolved);
}

// The suggestions a markup leaves out, and those it shows as plain text.
function suggestionTags(markup: PrintPageOptions['markup']) {
  if (markup === 'final') return { dropped: 'del', kept: 'ins' };
  if (markup === 'original') return { dropped: 'ins', kept: 'del' };
  return null;
}

// The tree held to the snapshot's allow-list (DOCE-EDITOR-6.23), its suggestions as the markup
// shows them.
function allow(trees: readonly PrintTree[], markup: PrintPageOptions['markup']): PrintTree[] {
  const tags = suggestionTags(markup);
  return trees.flatMap((tree): PrintTree[] => {
    if (!isPrintElement(tree)) return [tree];
    const suggestion = tree.attrs.has('data-id') ? tree.tag : '';
    if (SNAPSHOT_DROPPED.has(tree.tag) || suggestion === tags?.dropped) return [];
    const children = allow(tree.children, markup);
    if (!SNAPSHOT_ELEMENTS.has(tree.tag) || suggestion === tags?.kept) return children;
    for (const [name, value] of [...tree.attrs]) {
      if (!isAllowedAttribute(name, value)) tree.attrs.delete(name);
    }
    tree.children = children;
    return [tree];
  });
}

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
  const tr = setPageRegions(
    EditorState.create({ doc: readDocumentFile(file, schema).doc }).tr,
    template,
  );
  numberFootnotes(tr);
  const { doc } = tr;
  const trees: PrintTree[] = [];
  doc.forEach((node) => trees.push(...nodeTree(node, drawNode)));
  addLinks(trees, elementNumbers(doc, template), options);
  const markup = options.markup ?? 'all';
  const root = printElement(
    'div',
    { class: ROOT_CLASS, 'data-mode': 'reading', 'data-markup': markup, 'data-print': 'true' },
    allow(trees, markup),
  );
  const properties = Object.entries(templateProperties(template))
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ');
  const links = (options.stylesheets ?? [])
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
    .join('');
  const styles = (options.styles ?? []).map((css) => `<style>${css}</style>`).join('');
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<title>${escapeHtml(options.title ?? '')}</title>`,
    `<style>${sheetRules(doc, template)} :root { color-scheme: light; ${properties} } `,
    '.de-static a[data-print-link] { color: inherit; text-decoration: inherit; }',
    // Unlaid, a section's content flows over as many sheets as it takes, inside the @page margins.
    '.de-static .pm-page { width: auto !important; height: auto !important; min-height: 0 !important;',
    ' padding: 0 !important; margin: 0 !important; overflow: visible !important; }',
    '.de-static .pm-section { break-before: page; } .de-static .pm-section:first-child { break-before: auto; }',
    '</style>',
    links,
    styles,
    `</head><body class="de-static">${printHtml([root])}</body></html>`,
  ].join('');
}
