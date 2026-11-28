// The served faces every surface of a document (an editor's pages, a viewer) adds to it
// (DOCE-PAGINATION-12.8), held once for the whole document: a surface drawing the very files
// another drew under a family shares its faces, and one drawing other files under a family another
// surface holds draws them under a family of its own, so two surfaces never draw each other's
// glyphs. A face goes from the document once no surface draws it.

import type { FontFaceFile, FontFiles } from '../host/font-files.js';
import { bytesHash } from '../utils/bytes-hash.js';

/** The faces a surface added to its document, and the family it draws each served family under. */
export interface FaceRegistration {
  /**
   * The family the surface draws a served family under: the family itself, or another one when a
   * surface already draws other files under it.
   */
  drawnFamily(family: string): string;
  /** Whether the surface draws some served family under another name. */
  readonly renamed: boolean;
  /**
   * Settles once every face has loaded or failed to, with the family key (`familyKey`) of each
   * family the browser refused a face of; all of that family's faces are taken out of the document.
   */
  readonly loaded: Promise<ReadonlySet<string>>;
  /** Takes the surface's faces out of the document, once no other surface draws them. */
  release(): void;
}

// One family's faces as drawn under one name, and how many surfaces draw them.
interface Held {
  readonly name: string;
  readonly files: string;
  readonly faces: readonly FontFace[];
  users: number;
}

/** A family's key, as CSS matches family names: without quotes, in any case. */
export const familyKey = (family: string) =>
  family
    .trim()
    .replace(/^["']|["']$/gu, '')
    .toLowerCase();

/**
 * What a face holds, as a key: two faces of a family with the same key draw the same glyphs, by the
 * content of their files, so the same file handed in a new buffer is the same face.
 */
export const faceKey = (face: FontFaceFile) =>
  `${String(face.weight)} ${face.style} ${face.unicodeRange ?? ''} ${bytesHash(face.bytes)}`;

const filesKey = (faces: readonly FontFaceFile[]) =>
  [...new Set(faces.map(faceKey))].sort().join('|');

const held = new WeakMap<Document, Map<string, Held[]>>();
let lastName = 0;

function familiesOf(doc: Document): Map<string, Held[]> {
  let families = held.get(doc);
  if (!families) {
    families = new Map();
    held.set(doc, families);
  }
  return families;
}

// The faces of a family's files as the document draws them under `name`.
function addFaces(doc: Document, name: string, files: readonly FontFaceFile[]): FontFace[] {
  return files.map((file) => {
    const face = new FontFace(name, file.bytes, {
      weight: String(file.weight),
      style: file.style,
      ...(file.unicodeRange ? { unicodeRange: file.unicodeRange } : {}),
    });
    doc.fonts.add(face);
    return face;
  });
}

// The faces of one family's files: those another surface holds for the same files, or new ones,
// under the family when no surface holds it, else under a family of the surface's own.
function holdFamily(doc: Document, family: string, files: readonly FontFaceFile[]): Held {
  const families = familiesOf(doc);
  const key = familyKey(family);
  const holders = families.get(key) ?? [];
  families.set(key, holders);
  const wanted = filesKey(files);
  const shared = holders.find((holder) => holder.files === wanted);
  if (shared) {
    shared.users += 1;
    return shared;
  }
  const taken = holders.some((holder) => familyKey(holder.name) === key);
  lastName += 1;
  const name = taken ? `${family} de-${String(lastName)}` : family;
  const holder: Held = { name, files: wanted, faces: addFaces(doc, name, files), users: 1 };
  holders.push(holder);
  return holder;
}

function letGo(doc: Document, family: string, holder: Held): void {
  holder.users -= 1;
  if (holder.users > 0) return;
  for (const face of holder.faces) doc.fonts.delete(face);
  const holders = familiesOf(doc).get(familyKey(family)) ?? [];
  holders.splice(holders.indexOf(holder), 1);
}

const NONE: FaceRegistration = {
  drawnFamily: (family) => family,
  renamed: false,
  loaded: Promise.resolve(new Set()),
  release: () => undefined,
};

// Loads each held face and gives the keys of the families the browser refused a face of, every face
// of those families taken out of the document.
async function refusedFamilies(
  doc: Document,
  holders: readonly (readonly [string, { readonly holder: Held }])[],
): Promise<ReadonlySet<string>> {
  const refused = new Set<string>();
  await Promise.all(
    holders.flatMap(([key, { holder }]) =>
      holder.faces.map((face) =>
        face.load().then(
          () => undefined,
          () => {
            refused.add(key);
          },
        ),
      ),
    ),
  );
  // The family is no longer served, so none of its faces may draw: the browser would draw its text
  // in faces the engine does not measure. Every surface sharing the faces is refused the same.
  for (const [key, { holder }] of holders)
    if (refused.has(key)) for (const face of holder.faces) doc.fonts.delete(face);
  return refused;
}

/**
 * Adds a surface's served faces to its document, sharing those another surface drew from the same
 * files, until the surface releases them.
 */
export function registerFaces(doc: Document, fonts: FontFiles | null): FaceRegistration {
  if (!fonts?.faces.length || typeof FontFace === 'undefined' || !('fonts' in doc)) return NONE;
  const byFamily = new Map<string, { family: string; files: FontFaceFile[] }>();
  for (const face of fonts.faces) {
    const key = familyKey(face.family);
    const entry = byFamily.get(key) ?? { family: face.family, files: [] };
    // A face given twice is drawn once.
    if (!entry.files.some((file) => faceKey(file) === faceKey(face))) entry.files.push(face);
    byFamily.set(key, entry);
  }
  const holders = new Map<string, { family: string; holder: Held }>();
  for (const [key, { family, files }] of byFamily)
    holders.set(key, { family, holder: holdFamily(doc, family, files) });
  const loaded = refusedFamilies(doc, [...holders.entries()]);
  let released = false;
  return {
    drawnFamily: (family) => holders.get(familyKey(family))?.holder.name ?? family,
    renamed: [...holders.values()].some(
      ({ family, holder }) => familyKey(holder.name) !== familyKey(family),
    ),
    loaded,
    release() {
      if (released) return;
      released = true;
      for (const { family, holder } of holders.values()) letGo(doc, family, holder);
    },
  };
}

/** Whether a served face some surface added to the document is still loading. */
export function isLoadingFaces(doc: Document): boolean {
  for (const holders of held.get(doc)?.values() ?? [])
    for (const holder of holders)
      if (holder.faces.some((face) => face.status === 'loading')) return true;
  return false;
}
