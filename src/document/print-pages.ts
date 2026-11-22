// A document's laid-out pages drawn without a view or a DOM (DOCE-PAGINATION-13.3), from the
// layout the editor handed over (`PagesLayout`): every page with its own header and footer, its
// content and its footnotes, each forced block on its computed lines, each variable with the value
// the pages showed, and each section in its template scope, as the pages' view draws them.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { elementNumbers } from '../engine/print-links.js';
import {
  createDocumentSchema,
  findTemplateSection,
  joinDocumentPages,
  sectionRestartsNumbering,
  type TemplateFile,
  templatePageMetrics,
  templateProperties,
} from '../model/index.js';
import { type PagesLayout, type PagesLayoutBlock, readPagesDocument } from './pages-layout.js';
import { type PrintPageOptions, ROOT_CLASS } from './print.js';
import { addLinks, allow, drawNode, numberFootnotes, standalonePage } from './print-content.js';
import { linesContent } from './print-lines.js';
import {
  isPrintElement,
  type NodeDrawing,
  nodeTree,
  type PrintElement,
  printElement,
  printHtml,
  type PrintTree,
} from './print-tree.js';

/** What the pages are drawn with beside their layout. */
interface PagesDrawing {
  readonly template: TemplateFile;
  /** How a node draws besides its schema's rendering, such as a signature from its vector. */
  readonly draw: NodeDrawing['draw'];
}

// A section's hooks from its template section, as the sections plugin draws them on the pages.
function sectionHooks(element: PrintElement, node: ProseMirrorNode, template: TemplateFile) {
  const name = (node.attrs.sectionName as string | null | undefined) ?? null;
  const section = name ? findTemplateSection(template, name) : null;
  if (!section) return;
  const properties = Object.entries(templateProperties(template, { section }));
  element.attrs.set('style', properties.map(([key, value]) => `${key}: ${value}`).join('; '));
  if (sectionRestartsNumbering(section)) element.attrs.set('data-numbering', 'restart');
}

// A forced block's hooks: how many lines it is drawn on, and a numbered heading's number.
function forcedHooks(element: PrintElement, block: PagesLayoutBlock) {
  const own = element.attrs.get('class');
  element.attrs.set('class', own ? `${own} de-forced-lines` : 'de-forced-lines');
  element.attrs.set('data-lines', String(block.lines));
  if (block.number) element.attrs.set('data-number', block.number);
}

// The first element a node draws, which carries its hooks.
const rootOf = (drawn: PrintTree[]) => drawn.find(isPrintElement);

/** The drawing of a layout's pages: its nodes' hooks, lines and variable values by position. */
function layoutDrawing(layout: PagesLayout, options: PagesDrawing): NodeDrawing {
  const blocks = new Map(layout.blocks.map((block) => [block.pos, block]));
  const values = new Map(layout.variables.map((variable) => [variable.pos, variable.text]));
  const drawing: NodeDrawing = {
    draw(node, drawn, pos) {
      const own = options.draw(node, drawn, pos);
      const element = rootOf(own);
      if (!element) return own;
      const name = node.type.name;
      if (name === 'page_section') sectionHooks(element, node, options.template);
      const block = blocks.get(pos);
      if (block) forcedHooks(element, block);
      const order = Number(node.attrs.order ?? 1);
      // A list's continuation numbers on from the items before it, as the list starts draw it.
      if (name === 'ordered_list' && order > 1) {
        const style = element.attrs.get('style');
        const start = `--de-list-start: ${String(order - 1)}`;
        element.attrs.set('style', style ? `${style}; ${start}` : start);
      }
      return own;
    },
    content(node, pos) {
      const block = blocks.get(pos);
      if (block) return linesContent(node, block.marks, { pos, drawing });
      const value = node.type.name === 'template_variable' ? values.get(pos + 1) : undefined;
      // A variable shows the value the pages showed, before its own content, as its widget did.
      if (value === undefined) return null;
      const children: PrintTree[] = [];
      node.forEach((child, offset) => {
        children.push(...nodeTree(child, drawing, { at: pos + 1 + offset }));
      });
      return [{ text: value }, ...children];
    },
  };
  return drawing;
}

/** Each section of a laid-out pages' document, drawn with its pages, in order. */
function pagesTrees(doc: ProseMirrorNode, layout: PagesLayout, options: PagesDrawing): PrintTree[] {
  const drawing = layoutDrawing(layout, options);
  const trees: PrintTree[] = [];
  doc.forEach((node, offset) => trees.push(...nodeTree(node, drawing, { at: offset })));
  return trees;
}

// The class of the element that holds the pages, as the editor's view draws it, and all of its
// classes: the view's own, the rich text engine's content class and the editor's slot class.
const CONTENT_CLASS = 'de-document-editor__content';
export const VIEW_CLASSES = `ProseMirror ui-rich-text-engine-content ${CONTENT_CLASS}`;

// Each page printed on its section's sheet, edge to edge, a sheet break after every page but the
// last, as a snapshot of the pages prints them.
function pageSheetRules(doc: ProseMirrorNode, template: TemplateFile): string {
  const sizes: string[] = [];
  const { width, height } = templatePageMetrics(template);
  const rules = [`@page { size: ${String(width)}px ${String(height)}px; margin: 0; }`];
  doc.forEach((node, _offset, index) => {
    if (node.type.name !== 'page_section') return;
    const scope = findTemplateSection(template, node.attrs.sectionName as string | null);
    const { width, height } = templatePageMetrics(template, scope);
    const size = `${String(width)}px ${String(height)}px`;
    if (!sizes.includes(size)) {
      rules.push(`@page de-sheet-${String(sizes.length)} { size: ${size}; margin: 0; }`);
      sizes.push(size);
    }
    const name = `de-sheet-${String(sizes.indexOf(size))}`;
    rules.push(
      `.de-static .${CONTENT_CLASS} > :nth-child(${String(index + 1)}) { page: ${name}; }`,
    );
  });
  return rules.join(' ');
}

// A layout's document and its sections drawn with their pages, linked, numbered and allowed, as
// every static drawing of the layout draws them.
function drawnLayout(layout: PagesLayout, template: TemplateFile, options: PrintPageOptions) {
  const doc = readPagesDocument(layout, createDocumentSchema(options.kit));
  const trees = pagesTrees(doc, layout, { template, draw: drawNode });
  numberFootnotes(trees, doc, layout.footnoteNumbering);
  addLinks(trees, elementNumbers(joinDocumentPages(doc).doc, template), options);
  return { doc, trees: allow(trees, options.markup ?? 'all') };
}

/** One page of a layout drawn on its own: where it is, its element's attributes, its content. */
interface LayoutPageDrawing {
  /** Where the page is in the pages' document. */
  readonly pos: number;
  readonly attrs: Readonly<Record<string, string>>;
  /** Its regions as HTML, allowed and escaped as a print's. */
  readonly html: string;
}

/** One section of a layout: its element's attributes and its pages. */
interface LayoutSectionDrawing {
  readonly attrs: Readonly<Record<string, string>>;
  readonly pages: readonly LayoutPageDrawing[];
}

/** A layout's pages drawn page by page, for a view that draws only some of them at a time. */
interface LayoutDrawing {
  /** The pages' document. */
  readonly doc: ProseMirrorNode;
  readonly sections: readonly LayoutSectionDrawing[];
}

const attrsOf = (tree: PrintTree | undefined) =>
  tree && isPrintElement(tree) ? Object.fromEntries(tree.attrs) : {};

/**
 * A layout's pages as `renderLayoutPrintPage` draws them, section by section and page by page,
 * each page's content as HTML on its own.
 */
export function drawLayoutPages(
  layout: PagesLayout,
  template: TemplateFile,
  options: PrintPageOptions = {},
): LayoutDrawing {
  const { doc, trees } = drawnLayout(layout, template, options);
  const sections: LayoutSectionDrawing[] = [];
  doc.forEach((section, offset, index) => {
    const tree = trees[index];
    const drawn = tree && isPrintElement(tree) ? tree.children.filter(isPrintElement) : [];
    const pages: LayoutPageDrawing[] = [];
    section.forEach((_page, at, number) => {
      const page = drawn[number];
      pages.push({
        pos: offset + 1 + at,
        attrs: attrsOf(page),
        html: printHtml(page?.children ?? []),
      });
    });
    sections.push({ attrs: attrsOf(tree), pages });
  });
  return { doc, sections };
}

/**
 * A document's pages as the editor laid them out on the text layout engine's lines, as a
 * standalone HTML page drawn without an editor or a DOM: every page on its section's sheet with
 * its own header, footer and footnotes, each forced block on its computed lines, with the links,
 * numbers, images and allow-list of `renderPrintPage`.
 */
export function renderLayoutPrintPage(
  layout: PagesLayout,
  template: TemplateFile,
  options: PrintPageOptions = {},
): string {
  const { doc, trees } = drawnLayout(layout, template, options);
  const markup = options.markup ?? 'all';
  const root = printElement(
    'div',
    {
      class: ROOT_CLASS,
      'data-mode': 'reading',
      'data-markup': markup,
      'data-print': 'true',
      'data-layout': 'page',
      'data-text-layout': 'pretext',
    },
    // The pages' own element, with the classes the editor's view has, which the stylesheets style
    // and where their counters start.
    [printElement('div', { class: VIEW_CLASSES }, trees)],
  );
  return standalonePage(root, {
    ...options,
    template,
    bodyClass: 'de-static',
    rules: [
      pageSheetRules(doc, template),
      '.pm-page { break-after: page; } .pm-section:last-child > .pm-page:last-child { break-after: auto; }',
      '@media print { body.de-static { margin: 0; } .de-static :is(.pm-section, .pm-page) { margin: 0 !important; gap: 0 !important; } }',
      '.de-static a[data-print-link] { color: inherit; text-decoration: inherit; }',
      '.de-static, .de-static * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }',
    ],
  });
}
