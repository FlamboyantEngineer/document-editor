// The paged layout's node types: sections of pages, each page's header, content and footer, and
// manual page breaks.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor';
import type { Node as ProseMirrorNode, NodeSpec } from 'prosemirror-model';
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
  parseDOM: [{ tag: 'div.pm-section', getAttrs: readSectionAttrs }],
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
