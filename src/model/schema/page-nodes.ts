// The paged layout's node types: sections of pages, each page's header, content and footer, and
// manual page breaks.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor/kit';
import {
  DOMParser,
  Fragment,
  type Node as ProseMirrorNode,
  type NodeSpec,
  type NodeType,
  type Schema,
} from 'prosemirror-model';
import {
  appendPageRegionEditableAttrs,
  type DomAttributes,
  parsePageRegionEditable,
} from './dom-attributes.js';
import { DOCUMENT_NODE_ORDER } from './node-order.js';
import { type DocumentSchemaOptions, resolveSchemaOptions } from './schema-options.js';

function readSectionAttrs(dom: HTMLElement) {
  return {
    editable: dom.getAttribute('data-section-editable') !== 'false',
    sectionName: dom.getAttribute('data-section-name') || null,
    sectionCssVars: dom.getAttribute('data-section-css-vars') || null,
    pageHeader: readRegion(dom.getAttribute('data-page-header')),
    pageFooter: readRegion(dom.getAttribute('data-page-footer')),
  };
}

// A section's own page header or footer, written as JSON (DOCE-FORMAT-1.6).
function readRegion(value: string | null): unknown {
  if (!value) return null;
  try {
    const region = JSON.parse(value) as unknown;
    return region && typeof region === 'object' && !Array.isArray(region) ? region : null;
  } catch {
    return null;
  }
}

function writeSectionAttrs(node: ProseMirrorNode): DomAttributes {
  const attrs: DomAttributes = { class: 'pm-section', 'data-pm-section': 'true' };
  const { sectionName, editable, sectionCssVars, pageHeader, pageFooter } = node.attrs;
  if (sectionName) attrs['data-section-name'] = String(sectionName);
  if (editable === false) {
    attrs['data-section-editable'] = 'false';
    attrs.contenteditable = 'false';
  }
  if (sectionCssVars) attrs['data-section-css-vars'] = String(sectionCssVars);
  if (pageHeader) attrs['data-page-header'] = JSON.stringify(pageHeader);
  if (pageFooter) attrs['data-page-footer'] = JSON.stringify(pageFooter);
  return attrs;
}

// A page's regions in order, each with the class its markup carries.
const PAGE_REGIONS = [
  ['page_header', 'pm-page-header'],
  ['page_content', 'pm-page-content'],
  ['page_footnotes', 'pm-page-footnotes'],
  ['page_footer', 'pm-page-footer'],
] as const;

const childWithClass = (dom: Element, name: string) =>
  [...dom.children].find((child) => child.classList.contains(name)) ?? null;

// A region read from its element, with the attributes its own parse rule reads, or an empty region.
function readRegionNode(type: NodeType, dom: Element | null, schema: Schema): ProseMirrorNode {
  if (!dom) return type.createAndFill() ?? type.create();
  const rule = type.spec.parseDOM?.[0];
  const attrs = rule?.getAttrs?.(dom as HTMLElement) || null;
  return DOMParser.fromSchema(schema).parse(dom, { topNode: type.create(attrs) });
}

// A node type of the page nodes, which this extension adds to every schema it builds.
function pageNodeType(schema: Schema, name: string): NodeType {
  const type = schema.nodes[name];
  if (!type) throw new Error(`The schema has no ${name} node type.`);
  return type;
}

// A page's regions read by their classes, so content never falls into a region the markup leaves
// out, such as a page without a header.
function readPage(schema: Schema, regions: (name: string) => Element | null): ProseMirrorNode {
  return pageNodeType(schema, 'page').create(
    null,
    PAGE_REGIONS.map(([type, name]) =>
      readRegionNode(pageNodeType(schema, type), regions(name), schema),
    ),
  );
}

// A section's pages; a section that holds its blocks directly, with no pages, reads as one page
// whose content they are, its footnote area kept apart.
function readSectionContent(dom: Node, schema: Schema): Fragment {
  const section = dom as HTMLElement;
  const pages = [...section.children].filter((child) => child.classList.contains('pm-page'));
  if (pages.length) {
    return Fragment.from(
      pages.map((page) =>
        readPage(schema, (name) =>
          name === 'pm-page-content'
            ? (childWithClass(page, name) ?? page)
            : childWithClass(page, name),
        ),
      ),
    );
  }
  const content = section.cloneNode(true) as HTMLElement;
  const footnotes = childWithClass(content, 'pm-page-footnotes');
  footnotes?.remove();
  return Fragment.from(
    readPage(schema, (name) =>
      name === 'pm-page-content' ? content : name === 'pm-page-footnotes' ? footnotes : null,
    ),
  );
}

const pageSection: NodeSpec = {
  content: 'page+',
  defining: true,
  attrs: {
    editable: { default: true },
    sectionName: { default: null },
    sectionCssVars: { default: null },
    pageHeader: { default: null },
    pageFooter: { default: null },
  },
  parseDOM: [{ tag: 'div.pm-section', getAttrs: readSectionAttrs, getContent: readSectionContent }],
  toDOM: (node) => ['div', writeSectionAttrs(node), 0],
};

const page: NodeSpec = {
  content: 'page_header page_content page_footnotes page_footer',
  defining: true,
  parseDOM: [{ tag: 'div.pm-page' }],
  toDOM: () => ['div', { class: 'pm-page', 'data-pm-page': 'true' }, 0],
};

/** A page region that holds content and may say whether it is editable. */
function pageRegion(
  name: string,
  spec: NodeSpec,
  readAttrs: (dom: HTMLElement) => object = () => ({}),
): NodeSpec {
  return {
    ...spec,
    parseDOM: [
      {
        tag: `div.pm-${name}${name === 'page-content' ? '' : `[data-pm-${name}="true"]`}`,
        getAttrs: (dom: HTMLElement) => ({
          ...readAttrs(dom),
          editable: parsePageRegionEditable(dom),
        }),
      },
    ],
    toDOM: (node: ProseMirrorNode) => [
      'div',
      appendPageRegionEditableAttrs(
        { class: `pm-${name}`, [`data-pm-${name}`]: 'true' },
        node.attrs.editable,
      ),
      0,
    ],
  };
}

/** A page header or footer, whose text a template sets. */
function pageChrome(name: 'page-header' | 'page-footer', placeholder: string): NodeSpec {
  const sectionAttr = name === 'page-header' ? 'data-page-header' : 'data-page-footer';
  const spec: NodeSpec = {
    content: 'block*',
    selectable: false,
    isolating: true,
    attrs: {
      html: { default: placeholder },
      pageNumber: { default: 1 },
      totalPages: { default: 1 },
      editable: { default: null },
    },
  };
  return pageRegion(name, spec, (dom) => {
    const sectionValue = dom.parentElement?.parentElement?.getAttribute(sectionAttr);
    const html = dom.innerHTML.trim() || (sectionValue === '' ? '' : placeholder);
    return { html, pageNumber: 1, totalPages: 1 };
  });
}

const pageBreak: NodeSpec = {
  group: 'block',
  atom: true,
  parseDOM: [{ tag: 'hr[data-page-break="manual"]' }],
  toDOM: () => ['hr', { 'data-page-break': 'manual', class: 'manual-page-break' }],
};

/** Sections, pages, page headers, content and footers, and manual page breaks. */
export function createPageNodesExtension(options?: DocumentSchemaOptions): RichTextExtension {
  const { headerPlaceholder, footerPlaceholder } = resolveSchemaOptions(options);
  const order = DOCUMENT_NODE_ORDER;
  return {
    name: 'page-nodes',
    nodes: [
      { name: 'page_section', spec: pageSection, order: order.page_section },
      { name: 'page', spec: page, order: order.page },
      {
        name: 'page_content',
        spec: pageRegion('page-content', {
          content: '(block | layout)*',
          defining: true,
          // The first block type the content allows is no text block, so a gap cursor between two
          // objects would otherwise never be valid there.
          allowGapCursor: true,
          attrs: { editable: { default: null } },
        }),
        order: order.page_content,
      },
      {
        name: 'page_header',
        spec: pageChrome('page-header', headerPlaceholder),
        order: order.page_header,
      },
      {
        name: 'page_footer',
        spec: pageChrome('page-footer', footerPlaceholder),
        order: order.page_footer,
      },
      { name: 'page_break', spec: pageBreak, order: order.page_break },
    ],
  };
}
