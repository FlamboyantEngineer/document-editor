// Figures (an image or a diagram with its caption) and inline images, including images a
// template places from its own files.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor/kit';
import type { Node as ProseMirrorNode, NodeSpec } from 'prosemirror-model';
import { type DomAttributes, REQUIRED_SIZE } from './dom-attributes.js';
import { createImageNode } from './image-node.js';
import { DOCUMENT_NODE_ORDER } from './node-order.js';
import { objectLayoutCss, parseObjectLayout } from './object-layout.js';
import {
  type DocumentSchemaOptions,
  type ResolvedSchemaOptions,
  resolveSchemaOptions,
} from './schema-options.js';

/** The image a diagram without a stored rendering shows. */
const DIAGRAM_PLACEHOLDER =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img" aria-label="Diagram preview unavailable"><rect width="640" height="360" fill="#f1f5f9"/><rect x="20" y="20" width="600" height="320" rx="10" ry="10" fill="#e2e8f0"/><text x="320" y="186" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#64748b">Diagram preview unavailable</text></svg>',
  );

// A size in pixels: a positive number, or none. A figure's size is written into its image's style,
// so any other text, which could carry declarations of its own, is no size. A figure in a document
// always has one (DOCE-SCHEMA-3.14).
function sizeOf(value: unknown): number | null {
  const size = typeof value === 'string' ? Number(value) : value;
  return typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : null;
}

const figureSize = (node: ProseMirrorNode) => ({
  width: sizeOf(node.attrs.width),
  height: sizeOf(node.attrs.height),
});

// A figure's size in markup: its own, else its image's; null without both sides.
function readFigureSize(dom: HTMLElement, image: Element | null) {
  const width = sizeOf(dom.getAttribute('data-figure-width') || image?.getAttribute('width'));
  const height = sizeOf(dom.getAttribute('data-figure-height') || image?.getAttribute('height'));
  return width && height ? { width, height } : null;
}

// A figure read from markup, or false for one with no size, which has no place in a document.
function readFigureAttrs(dom: HTMLElement) {
  const image = dom.querySelector(':scope > .doc-figure-image > img, :scope > img');
  const size = readFigureSize(dom, image);
  if (!size) return false;
  const fileAssetId = dom.getAttribute('data-file-asset-id') || '';
  const snapshotId = dom.getAttribute('data-snapshot-id') || '';
  const src = dom.getAttribute('data-figure-src') || image?.getAttribute('src') || '';
  return {
    figureType: dom.getAttribute('data-figure-type') || 'image',
    objectLayout: parseObjectLayout(dom.getAttribute('data-object-layout')),
    // A stored asset is canonical: the written src is only its preview address.
    src: fileAssetId && snapshotId ? '' : src,
    fileAssetId,
    snapshotId,
    alt: image?.getAttribute('alt') || 'figure',
    captionEnabled: dom.getAttribute('data-caption-enabled') !== 'false',
    ...size,
  };
}

/**
 * The style of the frame that sizes and aligns the image, so the caption spans the content width:
 * at its size, or across the page's width, and narrowed to its place when wider, scaled whole as
 * the pages lay it out (DOCE-PAGINATION-10.4). The frame holds the size whether or not the image
 * loads: a browser draws an image that fails in a box of its own.
 */
function frameStyle(node: ProseMirrorNode): string {
  const { width, height } = figureSize(node);
  const layout = parseObjectLayout(node.attrs.objectLayout);
  const across = layout === 'fit-page-width' ? 'width:100%' : `width:${String(width)}px`;
  const align = layout === 'fit-page-width' ? '' : objectLayoutCss(layout);
  return [
    'display:block',
    across,
    'max-width:100%',
    `aspect-ratio:${String(width)}/${String(height)}`,
    'overflow:hidden',
    align,
  ]
    .filter(Boolean)
    .join(';');
}

const IMAGE_STYLE = 'display:block;width:100%;height:100%;object-fit:contain';

/** The stored asset a figure shows, and the address the host previews it at. */
interface FigureAsset {
  fileAssetId: string;
  snapshotId: string;
  previewSrc: string;
}

function figureAsset(node: ProseMirrorNode, options: ResolvedSchemaOptions): FigureAsset | null {
  const fileAssetId = String(node.attrs.fileAssetId || '').trim();
  const snapshotId = String(node.attrs.snapshotId || '').trim();
  if (!fileAssetId || !snapshotId) return null;
  return { fileAssetId, snapshotId, previewSrc: options.assetPreviewUrl(fileAssetId, snapshotId) };
}

function figureAttrs(node: ProseMirrorNode, asset: FigureAsset | null): DomAttributes {
  const { width, height } = figureSize(node);
  const layout = parseObjectLayout(node.attrs.objectLayout);
  const attrs: DomAttributes = {};
  if (node.attrs.captionEnabled === false) attrs['data-caption-enabled'] = 'false';
  if (layout) attrs['data-object-layout'] = layout;
  attrs['data-figure-width'] = String(width);
  attrs['data-figure-height'] = String(height);
  // The asset is written whether or not the host previews it, so it survives a round trip.
  if (asset) {
    attrs['data-file-asset-id'] = String(node.attrs.fileAssetId);
    attrs['data-snapshot-id'] = String(node.attrs.snapshotId);
  }
  const canonicalSrc = asset?.previewSrc || String(node.attrs.src || '');
  if (canonicalSrc) attrs['data-figure-src'] = canonicalSrc;
  return attrs;
}

function figureImageAttrs(node: ProseMirrorNode, previewSrc: string): DomAttributes {
  const { figureType, src, alt } = node.attrs;
  const caption = node.textContent;
  const isDiagram = figureType === 'diagram';
  const { width, height } = figureSize(node);
  return {
    src: isDiagram ? previewSrc || DIAGRAM_PLACEHOLDER : previewSrc || String(src || ''),
    alt: isDiagram ? caption || 'diagram' : String(alt || 'figure'),
    loading: 'lazy',
    decoding: 'async',
    style: IMAGE_STYLE,
    width: String(width),
    height: String(height),
  };
}

function renderFigure(node: ProseMirrorNode, options: ResolvedSchemaOptions) {
  const asset = figureAsset(node, options);
  const attrs = {
    ...figureAttrs(node, asset),
    'data-figure-type': node.attrs.figureType === 'diagram' ? 'diagram' : 'image',
  };
  const image = [
    'span',
    { class: 'doc-figure-image', style: frameStyle(node), contenteditable: 'false' },
    ['img', figureImageAttrs(node, asset?.previewSrc ?? '')],
  ];
  // The caption is the figure's content, in a slot of its own after the image.
  return ['figure', attrs, image, ['div', { class: 'doc-figure-caption-slot' }, 0]] as const;
}

// The element a figure's caption is read from: its caption slot, a pasted figure's own caption, or
// none, which makes it empty. The image is the figure's attributes, not its content.
function captionElement(dom: HTMLElement): HTMLElement {
  const own = dom.querySelector<HTMLElement>(':scope > .doc-figure-caption-slot');
  return own ?? dom.querySelector(':scope > figcaption') ?? dom.ownerDocument.createElement('div');
}

function createFigureNode(options: ResolvedSchemaOptions): NodeSpec {
  return {
    group: 'block',
    content: 'figure_caption',
    isolating: true,
    attrs: {
      figureType: { default: 'image' },
      objectLayout: { default: null },
      // Only an address typed in; uploaded and pasted figures store an asset and keep src empty.
      src: { default: '' },
      fileAssetId: { default: '' },
      snapshotId: { default: '' },
      alt: { default: 'figure' },
      captionEnabled: { default: true },
      width: REQUIRED_SIZE,
      height: REQUIRED_SIZE,
    },
    parseDOM: [
      {
        tag: 'figure',
        getAttrs: readFigureAttrs,
        contentElement: captionElement,
      },
    ],
    toDOM: (node) =>
      renderFigure(node, options) as unknown as ReturnType<NonNullable<NodeSpec['toDOM']>>,
  };
}

/** Figures and inline images. */
export function createFigureNodesExtension(options?: DocumentSchemaOptions): RichTextExtension {
  const resolved = resolveSchemaOptions(options);
  return {
    name: 'figure-nodes',
    nodes: [
      { name: 'figure', spec: createFigureNode(resolved), order: DOCUMENT_NODE_ORDER.figure },
      { name: 'image', spec: createImageNode(resolved), order: DOCUMENT_NODE_ORDER.image },
    ],
  };
}
