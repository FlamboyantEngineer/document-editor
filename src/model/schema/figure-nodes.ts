// Figures (an image or a diagram with its caption) and inline images, including images a
// template places from its own files.

import type { RichTextExtension } from '@flamboyantengineer/ui-components/rich-text-editor/kit';
import type { Node as ProseMirrorNode, NodeSpec } from 'prosemirror-model';
import type { DomAttributes } from './dom-attributes.js';
import { createImageNode } from './image-node.js';
import { DOCUMENT_NODE_ORDER } from './node-order.js';
import { objectLayoutCss, parseObjectLayout } from './object-layout.js';
import {
  type DocumentSchemaOptions,
  type ResolvedSchemaOptions,
  resolveSchemaOptions,
} from './schema-options.js';
import { svgIntrinsicSize } from './svg-size.js';

/** The image a diagram without a stored rendering shows. */
const DIAGRAM_PLACEHOLDER =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img" aria-label="Diagram preview unavailable"><rect width="640" height="360" fill="#f1f5f9"/><rect x="20" y="20" width="600" height="320" rx="10" ry="10" fill="#e2e8f0"/><text x="320" y="186" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#64748b">Diagram preview unavailable</text></svg>',
  );

// A size in pixels: a positive number, or none. A figure's size is written into its image's style,
// so any other text, which could carry declarations of its own, is no size.
function sizeOf(value: unknown): number | null {
  const size = typeof value === 'string' ? Number(value) : value;
  return typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : null;
}

const figureSize = (node: ProseMirrorNode) => ({
  width: sizeOf(node.attrs.width),
  height: sizeOf(node.attrs.height),
});

function readFigureAttrs(dom: HTMLElement) {
  const image = dom.querySelector(':scope > img');
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
    width: sizeOf(dom.getAttribute('data-figure-width')),
    height: sizeOf(dom.getAttribute('data-figure-height')),
  };
}

/** The style that sizes and aligns the image, so the caption spans the content width. */
function imageStyle(node: ProseMirrorNode): string | null {
  const { width, height } = figureSize(node);
  const layout = parseObjectLayout(node.attrs.objectLayout);
  if (layout === 'fit-page-width') {
    const ratio = width && height ? `;aspect-ratio:${String(width)}/${String(height)}` : '';
    return `display:block;width:100%;height:auto;object-fit:contain${ratio}`;
  }
  const size = [
    width ? `width:${String(width)}px` : '',
    height ? `height:${String(height)}px` : '',
    objectLayoutCss(layout),
  ].filter(Boolean);
  if (size.length === 0) return null;
  return `display:block;${size.join(';')};max-width:100%;object-fit:contain`;
}

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
  if (width) attrs['data-figure-width'] = String(width);
  if (height) attrs['data-figure-height'] = String(height);
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
  const style = imageStyle(node);
  const attrs: DomAttributes = {
    src: isDiagram ? previewSrc || DIAGRAM_PLACEHOLDER : previewSrc || String(src || ''),
    alt: isDiagram ? caption || 'diagram' : String(alt || 'figure'),
    loading: 'lazy',
    decoding: 'async',
  };
  // A diagram always takes the sizing style; an image only when it has a size or alignment.
  if (style) attrs.style = style;
  else if (isDiagram) attrs.style = 'display:block;max-width:100%;object-fit:contain';
  Object.assign(attrs, imageSize(node, attrs.src ?? ''));
  return attrs;
}

// The width and height an image is written with: the figure's own, or, for an inline SVG image
// without one, the size it states, so it is drawn at its size before it loads.
function imageSize(node: ProseMirrorNode, src: string): DomAttributes {
  const own = figureSize(node);
  const size =
    own.width || own.height || node.attrs.figureType === 'diagram' ? own : svgIntrinsicSize(src);
  const written: DomAttributes = {};
  if (size?.width) written.width = String(size.width);
  if (size?.height) written.height = String(size.height);
  return written;
}

function renderFigure(node: ProseMirrorNode, options: ResolvedSchemaOptions) {
  const asset = figureAsset(node, options);
  const attrs = {
    ...figureAttrs(node, asset),
    'data-figure-type': node.attrs.figureType === 'diagram' ? 'diagram' : 'image',
  };
  const image = [
    'img',
    { ...figureImageAttrs(node, asset?.previewSrc ?? ''), contenteditable: 'false' },
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
      width: { default: null },
      height: { default: null },
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
