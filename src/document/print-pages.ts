// A document's laid-out pages drawn without a view or a DOM (DOCE-PAGINATION-13.3), from the
// layout the editor handed over (`PagesLayout`): every page with its own header and footer, its
// content and its footnotes, each forced block on its computed lines, each variable with the value
// the pages showed, and each section in its template scope, as the pages' view draws them.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { mathDrawingHooks, mathDrawingTrees } from '../engine/math-drawing.js';
import { isMath, type MathTree } from '../engine/math-typeset.js';
import { elementNumbers } from '../engine/print-links.js';
import type { PlacedMath } from '../layout-engine/math-atoms.js';
import {
  createDocumentSchema,
  findTemplateSection,
  joinDocumentPages,
  sectionRestartsNumbering,
  type TemplateFile,
  templatePageMetrics,
  templateProperties,
} from '../model/index.js';
import { servedTemplate } from '../pagination/served-template.js';
import { fontFaceRules } from './font-faces.js';
import {
  type PagesLayout,
  type PagesLayoutBlock,
  type PagesLayoutMath,
  type PagesLayoutNumber,
  readPagesDocument,
} from './pages-layout.js';
import { type PrintPageOptions, ROOT_CLASS } from './print.js';
import { codeContent, drawCodeParts, isCode } from './print-code.js';
import {
  addLinks,
  allow,
  allowedIds,
  drawImages,
  drawNode,
  numberFootnotes,
  type PrintMarkup,
  standalonePage,
} from './print-content.js';
import { linesContent, shownTrees } from './print-lines.js';
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

// A forced block's hooks: how many lines it is drawn on, its direction, and a numbered heading's
// number and the indent its first line starts with.
function forcedHooks(element: PrintElement, block: PagesLayoutBlock) {
  const own = element.attrs.get('class');
  element.attrs.set('class', own ? `${own} de-forced-lines` : 'de-forced-lines');
  element.attrs.set('data-lines', String(block.lines));
  if (block.number) element.attrs.set('data-number', block.number);
  element.attrs.set('dir', block.direction ?? 'ltr');
  if (block.style) {
    const style = element.attrs.get('style');
    element.attrs.set('style', style ? `${style}; ${block.style}` : block.style);
  }
}

// A value as a CSS string.
const cssString = (value: string) => `"${value.replace(/["\\]/gu, (char) => `\\${char}`)}"`;

// A style declaration added to an element's own.
function addStyle(element: PrintElement, declaration: string) {
  const style = element.attrs.get('style');
  element.attrs.set('style', style ? `${style}; ${declaration}` : declaration);
}

// The number the engine laid a node out with: a heading's in `data-number`, a caption's or an
// equation's in `--de-number`, as the pages draw them (DOCE-PAGINATION-11.9).
function numberHooks(element: PrintElement, number: PagesLayoutNumber) {
  if (number.heading) element.attrs.set('data-number', number.number);
  else addStyle(element, `--de-number: ${cssString(number.number)}`);
}

// Math as the pages drew it (DOCE-PAGINATION-13.3): typeset as MathML, or what invalid math shows,
// on an element with the math views' hooks; math not typeset yet keeps its source. The renderer's
// reason, the view's title, is left out, as a snapshot leaves titles out.
function mathHooks(
  element: PrintElement,
  node: ProseMirrorNode,
  math: PagesLayoutMath | undefined,
) {
  const own = element.attrs.get('class');
  element.attrs.set('class', own ? `${own} de-math` : 'de-math');
  element.attrs.set('data-display', node.type.name === 'math_display' ? 'display' : 'inline');
  element.attrs.set('data-state', math?.state ?? 'pending');
  if (math?.state === 'ready') {
    // Drawn from its layout where the engine placed one, its MathML then hidden from sight
    // (DOCE-PAGINATION-12.11).
    const drawing = math.drawing ? drawingOf(element, math.drawing) : [];
    element.children = [...drawing, mathElement(math.math)];
  } else if (math?.state === 'invalid') element.children = [{ text: math.text }];
}

// The SVG math the engine placed is drawn as, with the placement's hooks on its element.
function drawingOf(element: PrintElement, placed: PlacedMath): PrintElement[] {
  const { style, ...attrs } = mathDrawingHooks(placed);
  for (const [name, value] of Object.entries(attrs)) element.attrs.set(name, value);
  addStyle(element, style);
  return mathDrawingTrees(placed).map(mathElement);
}

// A typeset MathML element as a rendered tree, which the snapshot's allow-list then holds to.
function mathElement(tree: MathTree): PrintElement {
  return printElement(
    tree.tag,
    tree.attrs,
    tree.children.map((child) =>
      typeof child === 'string' ? { text: child } : mathElement(child),
    ),
  );
}

// The first element a node draws, which carries its hooks.
const rootOf = (drawn: PrintTree[]) => drawn.find(isPrintElement);

/** The drawing of a layout's pages: its nodes' hooks, lines and variable values by position. */
function layoutDrawing(layout: PagesLayout, options: PagesDrawing): NodeDrawing {
  const blocks = new Map(layout.blocks.map((block) => [block.pos, block]));
  const values = new Map(layout.variables.map((variable) => [variable.pos, variable.text]));
  const numbers = new Map(layout.numbers.map((number) => [number.pos, number]));
  const math = new Map((layout.math ?? []).map((typeset) => [typeset.pos, typeset]));
  const drawing: NodeDrawing = {
    draw(node, drawn, pos) {
      const own = options.draw(node, drawn, pos);
      const element = rootOf(own);
      if (!element) return own;
      const name = node.type.name;
      if (name === 'page_section') sectionHooks(element, node, options.template);
      const block = blocks.get(pos);
      if (block) forcedHooks(element, block);
      if (block && isCode(node)) drawCodeParts(element, node, block);
      const number = numbers.get(pos);
      if (number) numberHooks(element, number);
      if (isMath(node)) mathHooks(element, node, math.get(pos));
      const order = Number(node.attrs.order ?? 1);
      // A list's continuation numbers on from the items before it, as the list starts draw it.
      if (name === 'ordered_list' && order > 1)
        addStyle(element, `--de-list-start: ${String(order - 1)}`);
      return own;
    },
    content(node, pos) {
      const block = blocks.get(pos);
      if (block && isCode(node)) return codeContent(node, block);
      if (block?.text !== undefined || block?.label) {
        // A caption's label in its parts, and the text a later part's caption shows.
        const text =
          block.text === undefined ? undefined : { text: block.text, marks: block.marks };
        const own = text ? [] : linesContent(node, block.marks, { pos, drawing });
        return [...shownTrees({ label: block.label, text }), ...own];
      }
      if (block) return linesContent(node, block.marks, { pos, drawing });
      const value = node.type.name === 'template_variable' ? values.get(pos + 1) : undefined;
      // A variable shows the value the pages showed, before its own content, as its widget did.
      if (value === undefined) return null;
      const children: PrintTree[] = [];
      node.forEach((child, offset) => {
        children.push(...nodeTree(child, drawing, { at: pos + 1 + offset }));
      });
      return [printElement('span', {}, [{ text: value }]), ...children];
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

/**
 * The template a layout's pages were drawn in: each generic family as the served family it stands
 * for, as the editor's pages draw it (DOCE-PAGINATION-12.5).
 */
export const layoutTemplate = (layout: PagesLayout, template: TemplateFile): TemplateFile =>
  servedTemplate(template, layout.fonts?.generics ?? {});

/**
 * What a static drawing of a layout holds beside it: as a print's, but its suggestions show as the
 * layout was laid out with them (`PagesLayout.markup`, DOCE-PAGINATION-11.12).
 */
export type LayoutPrintOptions = Omit<PrintPageOptions, 'markup'>;

// A layout's document and its sections drawn with their pages, linked and numbered through the
// whole document, as every static drawing of the layout draws them; their images and the
// allow-list come after, page by page where a view draws only some (DOCE-PAGINATION-13.6).
function linkedLayout(layout: PagesLayout, template: TemplateFile, options: LayoutPrintOptions) {
  const doc = readPagesDocument(layout, createDocumentSchema(options.kit));
  const trees = pagesTrees(doc, layout, { template, draw: drawNode });
  numberFootnotes(trees, doc, layout.footnoteNumbering);
  addLinks(trees, elementNumbers(joinDocumentPages(doc).doc, template), options);
  return { doc, trees };
}

// Trees with their images from the host's addresses, held to the allow-list as the layout's markup
// shows its suggestions.
function finished(
  trees: PrintTree[],
  layout: PagesLayout,
  options: LayoutPrintOptions,
): PrintTree[] {
  drawImages(trees, options.resolveImage);
  return allow(trees, layout.markup);
}

/** One page of a layout drawn on its own: where it is, its element's attributes, its content. */
interface LayoutPageDrawing {
  /** Where the page is in the pages' document. */
  readonly pos: number;
  readonly attrs: Readonly<Record<string, string>>;
  /**
   * Its regions as HTML, allowed and escaped as a print's, drawn when first asked for: only then
   * are its images' addresses asked of the host.
   */
  html(): string;
  /** The anchors its regions hold, which a link to the page goes to (DOCE-PAGINATION-13.9). */
  readonly anchors: readonly string[];
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

// An element's own attributes as the allow-list keeps them, without its content.
function allowedAttrs(tree: PrintTree | undefined, markup: PrintMarkup) {
  if (!tree || !isPrintElement(tree)) return {};
  const [shell] = allow([printElement(tree.tag, Object.fromEntries(tree.attrs))], markup);
  return shell && isPrintElement(shell) ? Object.fromEntries(shell.attrs) : {};
}

/**
 * A layout's pages as `renderLayoutPrintPage` draws them, section by section and page by page:
 * each section's and page's sheet at once, with the numbers and links of the whole document, and
 * each page's content as HTML only when it is asked for.
 */
export function drawLayoutPages(
  layout: PagesLayout,
  template: TemplateFile,
  options: LayoutPrintOptions = {},
): LayoutDrawing {
  const { doc, trees } = linkedLayout(layout, layoutTemplate(layout, template), options);
  const { markup } = layout;
  const sections: LayoutSectionDrawing[] = [];
  doc.forEach((section, offset, index) => {
    const tree = trees[index];
    const drawn = tree && isPrintElement(tree) ? tree.children.filter(isPrintElement) : [];
    const pages: LayoutPageDrawing[] = [];
    section.forEach((_page, at, number) => {
      const page = drawn[number];
      let html: string | null = null;
      pages.push({
        pos: offset + 1 + at,
        attrs: allowedAttrs(page, markup),
        html: () => (html ??= printHtml(finished(page?.children ?? [], layout, options))),
        anchors: allowedIds(page?.children ?? [], markup),
      });
    });
    sections.push({ attrs: allowedAttrs(tree, markup), pages });
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
  options: LayoutPrintOptions = {},
): string {
  const drawn = layoutTemplate(layout, template);
  const { doc, trees } = linkedLayout(layout, drawn, options);
  const { markup } = layout;
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
    [printElement('div', { class: VIEW_CLASSES }, finished(trees, layout, options))],
  );
  return standalonePage(root, {
    ...options,
    template: drawn,
    bodyClass: 'de-static',
    // In the language the pages were laid out in, as the editor's snapshot is (DOCE-PAGINATION-9.7).
    language: layout.language,
    rules: [
      pageSheetRules(doc, drawn),
      // The served faces the lines were broken in, so the print draws the same glyphs.
      fontFaceRules(layout.fonts),
      '.pm-page { break-after: page; } .pm-section:last-child > .pm-page:last-child { break-after: auto; }',
      '@media print { body.de-static { margin: 0; } .de-static :is(.pm-section, .pm-page) { margin: 0 !important; gap: 0 !important; } }',
      '.de-static a[data-print-link] { color: inherit; text-decoration: inherit; }',
      '.de-static, .de-static * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }',
    ],
  });
}
