// The inline image, including an image a template places from its own files, which renders in a
// wrapper that aligns it. A template image is stored by its asset and snapshot, never by an
// address: the host's `assetPreviewUrl` gives the address it shows, as of `assetsAsOf`.

import type { Node as ProseMirrorNode, NodeSpec } from 'prosemirror-model';
import { nodes as basicNodes } from 'prosemirror-schema-basic';
import {
  type DomAttributes,
  parseTemplateAssetImageAlignment,
  parseTemplateAssetImageNumber,
} from './dom-attributes.js';
import { readTooltip, type ResolvedSchemaOptions } from './schema-options.js';

/** A template image's size when it has none of its own. */
const DEFAULT_TEMPLATE_IMAGE_SIZE = { width: 160, height: 96 };

const templateImageAttrs = {
  templateAssetImage: { default: false },
  templateFileId: { default: '' },
  templateSnapshotId: { default: '' },
  templateImageName: { default: '' },
  templateImageMimeType: { default: '' },
  templateImageWidth: { default: '' },
  templateImageHeight: { default: '' },
  templateImageNaturalWidth: { default: '' },
  templateImageNaturalHeight: { default: '' },
  templateImageConstrain: { default: true },
  templateImageAlignment: { default: 'left' },
  imageStyle: { default: '' },
};

/** The template file an image's attributes or `templateFile:<file>:<snapshot>` address name. */
function readTemplateFile(dom: HTMLImageElement) {
  const match = /^templateFile:([^:]+):(.+)$/.exec(dom.getAttribute('src') || '');
  const fileId =
    dom.getAttribute('data-template-file-id') ||
    dom.getAttribute('data-file-asset-id') ||
    dom.getAttribute('data-file-id') ||
    match?.[1] ||
    '';
  return { fileId, snapshotId: dom.getAttribute('data-snapshot-id') || match?.[2] || '' };
}

/** A template image's size, from its own attributes, then the image's size. */
function readTemplateSize(dom: HTMLImageElement, axis: 'width' | 'height'): string | number {
  const value =
    dom.getAttribute(`data-template-image-${axis}`) ||
    dom.getAttribute(axis) ||
    dom.style[axis] ||
    '';
  return parseTemplateAssetImageNumber(value, '');
}

function readImageAttrs(dom: HTMLImageElement, options: ResolvedSchemaOptions) {
  const file = readTemplateFile(dom);
  const width = readTemplateSize(dom, 'width');
  const height = readTemplateSize(dom, 'height');
  const wrapper = dom.closest('[data-template-asset-image-wrapper]');
  return {
    // A template image's address is only a preview of its asset, so it is not kept.
    src: file.fileId ? '' : dom.getAttribute('src') || '',
    alt: dom.getAttribute('alt') || null,
    title: readTooltip(dom, options) || null,
    templateAssetImage:
      dom.getAttribute('data-template-asset-image') === 'true' || Boolean(file.fileId),
    templateFileId: file.fileId,
    templateSnapshotId: file.snapshotId,
    templateImageName: dom.getAttribute('data-template-image-name') || '',
    templateImageMimeType: dom.getAttribute('data-template-image-mime-type') || '',
    templateImageWidth: width,
    templateImageHeight: height,
    templateImageNaturalWidth: parseTemplateAssetImageNumber(
      dom.getAttribute('data-template-image-natural-width'),
      width || '',
    ),
    templateImageNaturalHeight: parseTemplateAssetImageNumber(
      dom.getAttribute('data-template-image-natural-height'),
      height || '',
    ),
    templateImageConstrain: dom.getAttribute('data-template-image-constrain') !== 'false',
    templateImageAlignment: parseTemplateAssetImageAlignment(
      dom.getAttribute('data-template-image-alignment') ||
        wrapper?.getAttribute('data-template-image-alignment'),
    ),
    imageStyle: dom.getAttribute('style') || '',
  };
}

/** The image's own attributes, leaving out those it has no value for. */
function plainImageAttrs(node: ProseMirrorNode, options: ResolvedSchemaOptions): DomAttributes {
  const attrs: Record<string, unknown> = {
    src: node.attrs.src,
    alt: node.attrs.alt,
    [options.tooltipAttribute]: node.attrs.title,
    loading: 'lazy',
    decoding: 'async',
  };
  const written: DomAttributes = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== null && value !== undefined && value !== '') written[key] = String(value);
  }
  return written;
}

function templateImageSize(node: ProseMirrorNode) {
  const width = parseTemplateAssetImageNumber(
    node.attrs.templateImageWidth,
    DEFAULT_TEMPLATE_IMAGE_SIZE.width,
  );
  const height = parseTemplateAssetImageNumber(
    node.attrs.templateImageHeight,
    DEFAULT_TEMPLATE_IMAGE_SIZE.height,
  );
  return {
    width: String(width),
    height: String(height),
    naturalWidth: String(
      parseTemplateAssetImageNumber(node.attrs.templateImageNaturalWidth, width),
    ),
    naturalHeight: String(
      parseTemplateAssetImageNumber(node.attrs.templateImageNaturalHeight, height),
    ),
  };
}

/**
 * A template image, in a wrapper that aligns it, at the address the host previews its asset at;
 * without one, the wrapper says the image was not found.
 */
function renderTemplateImage(
  node: ProseMirrorNode,
  { src: _stored, ...attrs }: DomAttributes,
  options: ResolvedSchemaOptions,
) {
  const { templateFileId, templateSnapshotId, templateImageName, templateImageMimeType } =
    node.attrs;
  const size = templateImageSize(node);
  const alignment = parseTemplateAssetImageAlignment(node.attrs.templateImageAlignment);
  const fileId = String(templateFileId || '');
  const snapshotId = String(templateSnapshotId || '');
  const src = fileId
    ? options.assetPreviewUrl(fileId, snapshotId, { asOf: options.assetsAsOf() })
    : '';
  const imageAttrs: DomAttributes = {
    ...(src ? { src } : {}),
    ...attrs,
    'data-template-asset-image': 'true',
    'data-template-file-id': fileId,
    'data-file-asset-id': fileId,
    'data-template-image-width': size.width,
    'data-template-image-height': size.height,
    'data-template-image-natural-width': size.naturalWidth,
    'data-template-image-natural-height': size.naturalHeight,
    'data-template-image-alignment': alignment,
    'data-template-image-constrain': node.attrs.templateImageConstrain === false ? 'false' : 'true',
    width: size.width,
    height: size.height,
    loading: 'lazy',
    decoding: 'async',
    style: `width: ${size.width}px; height: ${size.height}px; object-fit: contain;`,
  };
  if (snapshotId) imageAttrs['data-snapshot-id'] = snapshotId;
  if (templateImageName) imageAttrs['data-template-image-name'] = String(templateImageName);
  if (templateImageMimeType) {
    imageAttrs['data-template-image-mime-type'] = String(templateImageMimeType);
  }
  const wrapper: DomAttributes = {
    'data-template-asset-image-wrapper': 'true',
    'data-template-image-alignment': alignment,
    ...(src ? {} : { 'data-image-missing': 'true' }),
    style: `display: block; text-align: ${alignment}; line-height: 0;`,
  };
  return ['span', wrapper, ['img', imageAttrs]] as const;
}

/** The inline image node, which also places a template's own images. */
export function createImageNode(options: ResolvedSchemaOptions): NodeSpec {
  return {
    ...basicNodes.image,
    // A template image has no address of its own, so `src` may be empty.
    attrs: {
      ...basicNodes.image.attrs,
      src: { default: '', validate: 'string' },
      ...templateImageAttrs,
    },
    // Above the default priority, so a template image's wrapper parses before its inner image.
    parseDOM: [
      'span[data-template-asset-image-wrapper]',
      'img[src]',
      'img[data-template-file-id]',
    ].map((tag) => ({
      tag,
      priority: 60,
      getAttrs(element: HTMLElement) {
        const image =
          element.tagName.toLowerCase() === 'img'
            ? (element as HTMLImageElement)
            : element.querySelector<HTMLImageElement>('img[src], img[data-template-file-id]');
        return image ? readImageAttrs(image, options) : false;
      },
    })),
    toDOM(node: ProseMirrorNode) {
      const attrs = plainImageAttrs(node, options);
      if (!node.attrs.templateAssetImage && !node.attrs.templateFileId) return ['img', attrs];
      return renderTemplateImage(node, attrs, options) as unknown as ReturnType<
        NonNullable<NodeSpec['toDOM']>
      >;
    },
  };
}
