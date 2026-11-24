// The parts of a word processing document's package: each XML part read by its path, the
// relationships a part has to others (`_rels/<part>.rels`), and the images a part embeds, read up
// front so the readers that walk the part need not wait.

import { encodeBase64 } from '../../utils/base64.js';
import { importError } from '../import-error.js';
import type { ImportWarnings } from '../import-warnings.js';
import { readXml, type XmlElement } from '../xml-read.js';
import type { ZipArchive } from '../zip-read.js';
import {
  DEFAULT_DOCX_LIMITS,
  type DocxLimits,
  packageElements,
  refuseMacros,
  refuseNonStandardPart,
} from './docx-checks.js';

/** An image the document embeds: its bytes, media type and where it was stored. */
export interface ImportedImage {
  /** Its path in the package, such as `word/media/image1.png`. */
  readonly path: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
  /** The `src` the document's figure or image has for it. */
  readonly src: string;
}

/** A relationship from a part to another part or an outside target. */
interface Relationship {
  readonly type: string;
  /** The package path of the part it targets, or the outside URL. */
  readonly target: string;
  readonly external: boolean;
}

/** One XML part with what it refers to. */
export interface DocxPart {
  readonly path: string;
  readonly root: XmlElement;
  readonly relationships: ReadonlyMap<string, Relationship>;
  /** Its embedded images by relationship id; null for one the reader could not take in. */
  readonly images: ReadonlyMap<string, ImportedImage | null>;
}

/** How a package is read. */
interface PackageOptions {
  /** The `src` an embedded image is given; a `data:` URL by default. */
  readonly imageSource?: ((image: Omit<ImportedImage, 'src'>) => string) | undefined;
  /** How large an XML part may be and how deep it may nest. */
  readonly limits?: Pick<DocxLimits, 'xmlBytes' | 'xmlDepth'> | undefined;
}

const namespaces: ReadonlyMap<string, string> = new Map([
  ['http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w'],
  ['http://purl.oclc.org/ooxml/wordprocessingml/main', 'w'],
  ['http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'r'],
  ['http://purl.oclc.org/ooxml/officeDocument/relationships', 'r'],
  ['http://schemas.openxmlformats.org/drawingml/2006/main', 'a'],
  ['http://purl.oclc.org/ooxml/drawingml/main', 'a'],
  ['http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'wp'],
  ['http://purl.oclc.org/ooxml/drawingml/wordprocessingDrawing', 'wp'],
  ['http://schemas.openxmlformats.org/drawingml/2006/picture', 'pic'],
  ['http://purl.oclc.org/ooxml/drawingml/picture', 'pic'],
  ['http://schemas.openxmlformats.org/officeDocument/2006/math', 'm'],
  ['http://purl.oclc.org/ooxml/officeDocument/math', 'm'],
  ['http://schemas.microsoft.com/office/word/2010/wordml', 'w14'],
  ['http://schemas.microsoft.com/office/word/2012/wordml', 'w15'],
  ['http://schemas.microsoft.com/office/word/2010/wordprocessingShape', 'wps'],
  ['http://schemas.openxmlformats.org/markup-compatibility/2006', 'mc'],
  ['urn:schemas-microsoft-com:vml', 'v'],
  ['http://www.w3.org/XML/1998/namespace', 'xml'],
  ['http://schemas.openxmlformats.org/package/2006/content-types', 'opc-types'],
  ['http://schemas.openxmlformats.org/package/2006/relationships', 'opc-rels'],
]);

const MEDIA_TYPES: ReadonlyMap<string, string> = new Map([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'],
  ['bmp', 'image/bmp'],
  ['webp', 'image/webp'],
  ['svg', 'image/svg+xml'],
]);

/** The relationship type a part's role is named by, such as `officeDocument` or `image`. */
export const relationshipKind = (type: string) => type.slice(type.lastIndexOf('/') + 1);

// A target resolved against the folder of the part that refers to it.
function resolvePath(from: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = from.split('/').slice(0, -1);
  for (const step of target.split('/')) {
    if (step === '..') parts.pop();
    else if (step !== '.') parts.push(step);
  }
  return parts.join('/');
}

const relationshipsPath = (path: string) => {
  const slash = path.lastIndexOf('/');
  return `${path.slice(0, slash + 1)}_rels/${path.slice(slash + 1)}.rels`;
};

/** Reads the parts of a package, each once. */
export interface DocxPackage {
  /** Checks the package and opens its main document part. */
  readonly main: () => Promise<DocxPart>;
  /** A part with its relationships and images; null when the package has no such part. */
  readonly part: (path: string) => Promise<DocxPart | null>;
  /** The images read so far, in the order first met. */
  readonly images: ImportedImage[];
}

function xmlSource(bytes: Uint8Array): string {
  const first = bytes[0];
  const second = bytes[1];
  if ((first === 0xff && second === 0xfe) || (first === 0x3c && second === 0))
    return new TextDecoder('utf-16le', { fatal: true }).decode(bytes);
  if ((first === 0xfe && second === 0xff) || (first === 0 && second === 0x3c))
    return new TextDecoder('utf-16be', { fatal: true }).decode(bytes);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

async function readXmlPart(
  archive: ZipArchive,
  path: string,
  limits: Pick<DocxLimits, 'xmlBytes' | 'xmlDepth'>,
): Promise<XmlElement | null> {
  const bytes = await archive.read(path);
  if (!bytes) return null;
  if (bytes.length > limits.xmlBytes)
    throw importError('too-large', `An XML part is larger than ${String(limits.xmlBytes)} bytes.`);
  let text: string;
  try {
    text = xmlSource(bytes);
  } catch (cause) {
    throw Object.assign(importError('damaged', 'An XML part could not be decoded.'), { cause });
  }
  return readXml(text, limits.xmlDepth, namespaces);
}

function createXmlReader(archive: ZipArchive, limits: Pick<DocxLimits, 'xmlBytes' | 'xmlDepth'>) {
  const roots = new Map<string, Promise<XmlElement | null>>();
  return (path: string) => {
    let root = roots.get(path);
    if (!root) {
      root = readXmlPart(archive, path, limits);
      roots.set(path, root);
    }
    return root;
  };
}

/** The parts of a package read from its archive. */
export function openPackage(
  archive: ZipArchive,
  warnings: ImportWarnings,
  options: PackageOptions = {},
): DocxPackage {
  const images: ImportedImage[] = [];
  const readRoot = createXmlReader(archive, options.limits ?? DEFAULT_DOCX_LIMITS);
  const byPath = new Map<string, ImportedImage | null>();
  const readImage = async (path: string): Promise<ImportedImage | null> => {
    if (byPath.has(path)) return byPath.get(path) ?? null;
    const mediaType = MEDIA_TYPES.get(path.slice(path.lastIndexOf('.') + 1).toLowerCase());
    const bytes = mediaType ? await archive.read(path) : null;
    let image: ImportedImage | null = null;
    if (mediaType && bytes) {
      const src =
        options.imageSource?.({ path, mediaType, bytes }) ??
        `data:${mediaType};base64,${encodeBase64(bytes)}`;
      image = { path, mediaType, bytes, src };
      images.push(image);
    }
    byPath.set(path, image);
    return image;
  };
  const relationshipsOf = async (path: string) => {
    const relationships = new Map<string, Relationship>();
    for (const element of packageElements(
      await readRoot(relationshipsPath(path)),
      'Relationships',
      'Relationship',
    )) {
      const external = element.attrs.TargetMode === 'External';
      const target = element.attrs.Target ?? '';
      relationships.set(element.attrs.Id ?? '', {
        type: element.attrs.Type ?? '',
        target: external ? target : resolvePath(path, target),
        external,
      });
    }
    return relationships;
  };
  const readPart = async (path: string): Promise<DocxPart | null> => {
    const root = await readRoot(path);
    if (root === null) return null;
    const relationships = await relationshipsOf(path);
    const partImages = new Map<string, ImportedImage | null>();
    for (const [id, relationship] of relationships) {
      if (relationshipKind(relationship.type) !== 'image') continue;
      const image = relationship.external ? null : await readImage(relationship.target);
      if (!image)
        warnings.add(
          'image-left-out',
          relationship.external ? 'linked image' : relationship.target,
        );
      partImages.set(id, image);
    }
    return { path, root, relationships, images: partImages };
  };
  // Each part is read once, however many sections or readers ask for it.
  const parts = new Map<string, Promise<DocxPart | null>>();
  const part = (path: string) => {
    let known = parts.get(path);
    if (!known) {
      known = readPart(path);
      parts.set(path, known);
    }
    return known;
  };
  return {
    images,
    part,
    async main() {
      await refuseMacros(archive.paths, readRoot);
      const main = await part(mainDocumentPath(await readRoot('_rels/.rels')));
      if (!main) throw importError('damaged', 'The document part is missing.');
      return main;
    },
  };
}

// The path of the package's main document part, from the package relationships.
function mainDocumentPath(root: XmlElement | null): string {
  const main = packageElements(root, 'Relationships', 'Relationship').find(
    (element) => relationshipKind(element.attrs.Type ?? '') === 'officeDocument',
  );
  if (!main || main.attrs.TargetMode === 'External')
    throw importError('unreadable', 'The file is not a word processing document.');
  const path = resolvePath('', main.attrs.Target ?? '');
  refuseNonStandardPart('officeDocument', path);
  return path;
}
