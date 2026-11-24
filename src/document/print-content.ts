// What both static renders of a document draw beside its schema's rendering, without a DOM: the
// signatures from their vectors, the footnote numbers, the anchors, numbers, links and images a
// print snapshot keeps, the suggestions as the markup shows them, and the snapshot's allow-list.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { footnotePartLinks } from '../engine/footnote-anchors.js';
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

const escapeHtml = (value: string) =>
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

// Each element of a tree with the index of the page it is drawn on, in order; -1 before any page.
function* pagedElements(trees: readonly PrintTree[]) {
  let page = -1;
  for (const element of printElements(trees)) {
    if (element.attrs.get('data-pm-page') === 'true') page += 1;
    yield { element, page };
  }
}

// The index of the page each position of a document is on, as `pagedElements` counts pages.
function pageAt(doc: ProseMirrorNode) {
  const starts: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'page') return !node.isTextblock;
    starts.push(pos);
    return false;
  });
  return (pos: number) => starts.filter((start) => start < pos).length - 1;
}

const footnoteKey = (page: number, id: string) => `${String(page)} ${id}`;

// Each footnote marker's and entry's number, by the page it is drawn on, as the editor draws it:
// its text and its hooks (`createFootnoteNumbers`). A footnote drawn on more than one page (a
// marker in a repeated table header) takes each page's number there (DOCE-PAGINATION-13.11).
export function numberFootnotes(
  trees: PrintTree[],
  doc: ProseMirrorNode,
  numbering: 'document' | 'page' = 'document',
) {
  const numbers = new Map<string, string>();
  const pageOf = pageAt(doc);
  for (const { node, number, pos } of numberFootnoteParts(doc, numbering))
    numbers.set(footnoteKey(pageOf(pos), idOf(node) ?? ''), String(number));
  const tooltip = doc.type.schema.nodes.footnote_reference?.spec.tooltipAttribute;
  for (const { element, page } of pagedElements(trees)) {
    const number = numbers.get(footnoteKey(page, element.attrs.get('data-footnote-id') ?? ''));
    if (number === undefined) continue;
    const marker = element.attrs.has('data-footnote-reference');
    const shows = marker ? element : element.children.find(isPrintElement);
    if (!marker && !element.attrs.has('data-footnote-entry')) continue;
    element.attrs.set('data-footnote-number', number);
    element.attrs.set(typeof tooltip === 'string' ? tooltip : 'title', `Footnote ${number}`);
    if (shows) shows.children = [{ text: number }];
  }
}

// Each footnote marker and entry linked to its own page's part and back (DOCE-PAGINATION-13.11).
function linkFootnotes(trees: PrintTree[], anchor: (element: PrintElement, id: string) => boolean) {
  const found = [...pagedElements(trees)].flatMap(({ element, page }) => {
    const id = element.attrs.get('data-footnote-id');
    const marker = element.attrs.has('data-footnote-reference');
    if (!id || (!marker && !element.attrs.has('data-footnote-entry'))) return [];
    return [{ element, part: { id, marker, page } }];
  });
  footnotePartLinks(found.map(({ part }) => part)).forEach(({ anchor: id, href }, index) => {
    const { element, part } = found[index] ?? {};
    if (!element || !part) return;
    if (id) anchor(element, id);
    const number = part.marker ? element : element.children.find(isPrintElement);
    if (href && number) link(number, href, part.marker ? 'footnote' : 'footnote-back');
  });
}

// Whether an element keeps the number it was laid out with: a block drawn on the layout engine's
// lines, or a heading the engine numbered.
const keepsNumber = ({ attrs }: PrintElement) =>
  (attrs.get('class') ?? '').split(' ').includes('de-forced-lines') || attrs.has('data-number');

// Anchors, numbers and links, as a print snapshot has them (DOCE-EDITOR-6.21, 6.22).
export function addLinks(
  trees: PrintTree[],
  numbers: ReadonlyMap<string, string>,
  options: Pick<PrintLinkOptions, 'citationHref'>,
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
    if (id && anchor(element, id) && numbers.has(id) && !keepsNumber(element))
      attrs.set('data-number', numbers.get(id) ?? '');
    if (attrs.get('data-reference') === 'true') referenceLink(element, options.citationHref);
  }
  linkFootnotes(trees, anchor);
  linkAbbreviations(trees);
}

// Each image loading eagerly from the address `resolveImage` gives, as a print snapshot has it
// (DOCE-EDITOR-6.25); before the allow-list, which checks the address.
export function drawImages(trees: readonly PrintTree[], resolveImage: ResolveImage | undefined) {
  for (const element of printElements(trees)) {
    if (element.tag === 'img') image(element, resolveImage);
  }
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

// Whether an element is a suggestion's: an insertion or deletion with an id, or with only its
// comment thread's id, as the schema reads either (DOCE-EDITOR-6.16).
const isSuggestion = ({ attrs }: PrintElement) =>
  attrs.has('data-id') || attrs.has('data-comment-id');

// The suggestions a markup leaves out, and those it shows as plain text.
function suggestionTags(markup: PrintMarkup) {
  if (markup === 'final') return { dropped: 'del', kept: 'ins' };
  if (markup === 'original') return { dropped: 'ins', kept: 'del' };
  return null;
}

// What the allow-list does with an element: leaves it out with its content, keeps only its
// content, or keeps it.
function allowing(tree: PrintElement, markup: PrintMarkup): 'drop' | 'unwrap' | 'keep' {
  const tags = suggestionTags(markup);
  const suggestion = isSuggestion(tree) ? tree.tag : '';
  if (SNAPSHOT_DROPPED.has(tree.tag) || suggestion === tags?.dropped) return 'drop';
  if (!SNAPSHOT_ELEMENTS.has(tree.tag) || suggestion === tags?.kept) return 'unwrap';
  return 'keep';
}

// The tree held to the snapshot's allow-list (DOCE-EDITOR-6.23), its suggestions as the markup
// shows them.
export function allow(trees: readonly PrintTree[], markup: PrintMarkup): PrintTree[] {
  return trees.flatMap((tree): PrintTree[] => {
    if (!isPrintElement(tree)) return [tree];
    const kept = allowing(tree, markup);
    if (kept === 'drop') return [];
    const children = allow(tree.children, markup);
    if (kept === 'unwrap') return children;
    for (const [name, value] of [...tree.attrs]) {
      if (!isAllowedAttribute(name, value)) tree.attrs.delete(name);
    }
    tree.children = children;
    return [tree];
  });
}

/** The ids the tree's elements keep once held to the allow-list, without holding it to it. */
export function allowedIds(trees: readonly PrintTree[], markup: PrintMarkup): string[] {
  return trees.flatMap((tree): string[] => {
    if (!isPrintElement(tree)) return [];
    const kept = allowing(tree, markup);
    if (kept === 'drop') return [];
    const inside = allowedIds(tree.children, markup);
    const id = tree.attrs.get('id');
    const own = kept === 'keep' && id !== undefined && isAllowedAttribute('id', id) ? [id] : [];
    return [...own, ...inside];
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
  /** The language the page is in, on its root element; none when empty or absent. */
  readonly language?: string | undefined;
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
    `<!doctype html><html${page.language ? ` lang="${escapeHtml(page.language)}"` : ''}>`,
    '<head><meta charset="utf-8">',
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
