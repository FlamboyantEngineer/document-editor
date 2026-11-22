// What both static renders of a document draw beside its schema's rendering, without a DOM: the
// signatures from their vectors, the footnote numbers, the anchors, numbers, links and images a
// print snapshot keeps, the suggestions as the markup shows them, and the snapshot's allow-list.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { idOf } from '../engine/footnote-model.js';
import { numberFootnoteParts } from '../engine/footnote-numbers.js';
import {
  isAllowedAttribute,
  SNAPSHOT_DROPPED,
  SNAPSHOT_ELEMENTS,
} from '../engine/print-allow-list.js';
import type { ResolveImage } from '../engine/print-images.js';
import { PRINT_MARKER_RULES } from '../engine/print-view.js';
import { signatureSvgMarkup, type TemplateFile, templateProperties } from '../model/index.js';
import { footnoteEntryAnchor, footnoteMarkerAnchor } from '../model/schema/footnote-nodes.js';
import { type CitationHref, referencePrintHref } from '../model/schema/reference-mark.js';
import {
  isPrintElement,
  type PrintElement,
  printElement,
  printElements,
  printHtml,
  type PrintTree,
} from './print-tree.js';

/** Where a static render's links and images go. */
export interface PrintLinkOptions {
  /** Where a citation of another document links; unlinked without it. */
  readonly citationHref?: CitationHref | undefined;
  /** The address each image loads from, given the one the document names; null keeps it. */
  readonly resolveImage?: ResolveImage | undefined;
}

/** How a static render shows suggestions. */
export type PrintMarkup = 'all' | 'final' | 'original';

export const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A signature draws from its stored vector, as the editor's view draws it.
export function drawNode(node: ProseMirrorNode, drawn: PrintTree[]): PrintTree[] {
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

// Each footnote marker's and entry's number, through the document, as the editor draws it: its text
// and its hooks (`createFootnoteNumbers`).
export function numberFootnotes(
  trees: PrintTree[],
  doc: ProseMirrorNode,
  numbering: 'document' | 'page' = 'document',
) {
  const numbers = new Map<string, string>();
  for (const { node, number } of numberFootnoteParts(doc, numbering))
    numbers.set(idOf(node) ?? '', String(number));
  const tooltip = doc.type.schema.nodes.footnote_reference?.spec.tooltipAttribute;
  for (const element of printElements(trees)) {
    const number = numbers.get(element.attrs.get('data-footnote-id') ?? '');
    if (number === undefined) continue;
    const marker = element.attrs.has('data-footnote-reference');
    const shows = marker ? element : element.children.find(isPrintElement);
    if (!marker && !element.attrs.has('data-footnote-entry')) continue;
    element.attrs.set('data-footnote-number', number);
    element.attrs.set(typeof tooltip === 'string' ? tooltip : 'title', `Footnote ${number}`);
    if (shows) shows.children = [{ text: number }];
  }
}

// Anchors, numbers, links and images, as a print snapshot has them (DOCE-EDITOR-6.21, 6.22, 6.25).
export function addLinks(
  trees: PrintTree[],
  numbers: ReadonlyMap<string, string>,
  options: PrintLinkOptions,
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
    // A block drawn on the layout engine's lines keeps the number its lines were laid out with.
    const forced = (attrs.get('class') ?? '').split(' ').includes('de-forced-lines');
    if (id && anchor(element, id) && numbers.has(id) && !forced)
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
  linkAbbreviations(trees);
}

// Each abbreviation's link to a row the page holds, marked as a printed link; one whose list is
// not on the page gives way to its text (DOCE-EDITOR-6.21).
function linkAbbreviations(trees: PrintTree[]) {
  const ids = new Set<string>();
  for (const element of printElements(trees)) {
    const id = element.attrs.get('id');
    if (id) ids.add(id);
  }
  for (const element of printElements(trees)) {
    if (!element.attrs.has('data-abbreviation-ref')) continue;
    element.children = element.children.flatMap((child) => {
      if (!isPrintElement(child) || child.tag !== 'a') return [child];
      const target = (child.attrs.get('href') ?? '').replace(/^#/, '');
      if (!ids.has(target)) return child.children;
      child.attrs.set('data-print-link', 'abbreviation');
      return [child];
    });
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
function suggestionTags(markup: PrintMarkup) {
  if (markup === 'final') return { dropped: 'del', kept: 'ins' };
  if (markup === 'original') return { dropped: 'ins', kept: 'del' };
  return null;
}

// The tree held to the snapshot's allow-list (DOCE-EDITOR-6.23), its suggestions as the markup
// shows them.
export function allow(trees: readonly PrintTree[], markup: PrintMarkup): PrintTree[] {
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

/** A static render's page around its root: its title, rules and the host's stylesheets. */
interface StandalonePage {
  readonly template: TemplateFile;
  readonly title?: string | undefined;
  readonly styles?: readonly string[] | undefined;
  readonly stylesheets?: readonly string[] | undefined;
  /** The render's own rules, before the marker rules every print carries. */
  readonly rules: readonly string[];
  readonly bodyClass: string;
}

/** A static render's root as a standalone HTML page, in the template's properties. */
export function standalonePage(root: PrintElement, page: StandalonePage): string {
  const properties = Object.entries(templateProperties(page.template))
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ');
  const links = (page.stylesheets ?? [])
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
    .join('');
  const styles = (page.styles ?? []).map((css) => `<style>${css}</style>`).join('');
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<title>${escapeHtml(page.title ?? '')}</title>`,
    `<style>${page.rules[0] ?? ''} :root { color-scheme: light; ${properties} } `,
    page.rules.slice(1).join(''),
    PRINT_MARKER_RULES,
    '</style>',
    links,
    styles,
    `</head><body class="${page.bodyClass}">${printHtml([root])}</body></html>`,
  ].join('');
}
