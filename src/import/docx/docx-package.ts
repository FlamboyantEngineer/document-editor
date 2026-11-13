// The parts of a word processing document's package: each XML part read by its path, the
// relationships a part has to others (`_rels/<part>.rels`), and the images a part embeds, read up
// front so the readers that walk the part need not wait.

import { importError } from '../import-error.js';
import type { ImportWarnings } from '../import-warnings.js';
import { childElements, readXml, type XmlElement } from '../xml-read.js';
import type { ZipArchive } from '../zip-read.js';

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
export interface Relationship {
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
export interface PackageOptions {
  /** The `src` an embedded image is given; a `data:` URL by default. */
  readonly imageSource?: ((image: Omit<ImportedImage, 'src'>) => string) | undefined;
}

const MEDIA_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

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

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(binary);
}

/** Reads the parts of a package, each once. */
export interface DocxPackage {
  /** A part with its relationships and images; null when the package has no such part. */
  readonly part: (path: string) => Promise<DocxPart | null>;
  /** The images read so far, in the order first met. */
  readonly images: ImportedImage[];
}

async function readText(archive: ZipArchive, path: string): Promise<string | null> {
  const bytes = await archive.read(path);
  return bytes ? new TextDecoder().decode(bytes) : null;
}

/** The parts of a package read from its archive. */
export function openPackage(
  archive: ZipArchive,
  warnings: ImportWarnings,
  options: PackageOptions = {},
): DocxPackage {
  const images: ImportedImage[] = [];
  const byPath = new Map<string, ImportedImage | null>();
  const readImage = async (path: string): Promise<ImportedImage | null> => {
    if (byPath.has(path)) return byPath.get(path) ?? null;
    const mediaType = MEDIA_TYPES[path.slice(path.lastIndexOf('.') + 1).toLowerCase()];
    const bytes = mediaType ? await archive.read(path) : null;
    let image: ImportedImage | null = null;
    if (mediaType && bytes) {
      const src =
        options.imageSource?.({ path, mediaType, bytes }) ??
        `data:${mediaType};base64,${base64(bytes)}`;
      image = { path, mediaType, bytes, src };
      images.push(image);
    }
    byPath.set(path, image);
    return image;
  };
  const relationshipsOf = async (path: string) => {
    const text = await readText(archive, relationshipsPath(path));
    const relationships = new Map<string, Relationship>();
    for (const element of childElements(text ? readXml(text) : null, 'Relationship')) {
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
  return {
    images,
    part: async (path) => {
      const text = await readText(archive, path);
      if (text === null) return null;
      const root = readXml(text);
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
    },
  };
}

/** The path of the package's main document part, from the package relationships. */
export async function mainDocumentPath(archive: ZipArchive): Promise<string> {
  const text = await readText(archive, '_rels/.rels');
  const main = childElements(text ? readXml(text) : null, 'Relationship').find(
    (element) => relationshipKind(element.attrs.Type ?? '') === 'officeDocument',
  );
  if (!main) throw importError('unreadable', 'The file is not a word processing document.');
  return resolvePath('', main.attrs.Target ?? '');
}
