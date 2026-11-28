// The served faces every surface of a document (an editor's pages, a viewer) adds to it
// (DOCE-PAGINATION-12.8), held once for the whole document: a surface drawing the very files
// another drew under a family shares its faces, and one drawing other files under a family another
// surface holds draws them under a family of its own, so two surfaces never draw each other's
// glyphs. A face goes from the document once no surface draws it.

import type { FontFaceFile, FontFiles } from '../host/font-files.js';
import { familyKey, fontFaceKey, uniqueFontFaces, unquoteFamily } from '../utils/font-keys.js';

/** The faces a surface added to its document, and the family it draws each served family under. */
export interface FaceRegistration {
  /**
   * The family the surface draws a held family under: the family itself, or another one when a
   * surface already draws other files under it.
   */
  drawnFamily(family: string): string;
  /** Whether the surface draws some served family under another name. */
  readonly renamed: boolean;
  /**
   * Settles once every face has loaded or failed to, with the family key (`familyKey`) of each
   * family the browser refused to construct or load a face of. The document keeps none of that
   * registration's faces for a refused family.
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
  readonly loaded: Promise<boolean>;
  users: number;
}

interface DocumentFaces {
  readonly families: Map<string, Held[]>;
  readonly names: Set<string>;
  lastAlias: number;
}

const held = new WeakMap<Document, DocumentFaces>();

function facesOf(doc: Document): DocumentFaces {
  let faces = held.get(doc);
  if (!faces) {
    faces = { families: new Map(), names: new Set(), lastAlias: 0 };
    held.set(doc, faces);
  }
  return faces;
}

// An alias must leave room for the other literal names arriving in the same registration.
function chooseName(faces: DocumentFaces, family: string, incoming: ReadonlySet<string>): string {
  if (!faces.names.has(familyKey(family))) return family;
  let name: string;
  do {
    faces.lastAlias += 1;
    name = `${unquoteFamily(family)} de-${String(faces.lastAlias)}`;
  } while (faces.names.has(familyKey(name)) || incoming.has(familyKey(name)));
  return name;
}

// The faces of a family's files as the document draws them under `name`.
function addFaces(doc: Document, name: string, files: readonly FontFaceFile[]): FontFace[] | null {
  const faces: FontFace[] = [];
  try {
    for (const file of files) {
      const face = new FontFace(name, file.bytes, {
        weight: String(file.weight),
        style: file.style,
        ...(file.unicodeRange ? { unicodeRange: file.unicodeRange } : {}),
      });
      faces.push(face);
    }
    for (const face of faces) doc.fonts.add(face);
  } catch {
    for (const face of faces) {
      doc.fonts.delete(face);
      // A binary face can start loading in its constructor.
      void tryLoadFace(face);
    }
    return null;
  }
  return faces;
}

async function tryLoadFace(face: FontFace): Promise<boolean> {
  try {
    await face.load();
    return true;
  } catch {
    return false;
  }
}

async function loadFaces(faces: readonly FontFace[]): Promise<boolean> {
  return (await Promise.all(faces.map(tryLoadFace))).every(Boolean);
}

// The faces of one family's files: those another surface holds for the same files, or new ones,
// under the family when no surface holds it, else under a family of the surface's own.
function holdFamily(
  doc: Document,
  { family, files }: { family: string; files: readonly FontFaceFile[] },
  incoming: ReadonlySet<string>,
): Held | null {
  const faces = facesOf(doc);
  const { families } = faces;
  const key = familyKey(family);
  const holders = families.get(key) ?? [];
  // CSS tries overlapping faces in reverse order, so the order is part of a registration's identity.
  const wanted = JSON.stringify(files.map(fontFaceKey));
  const shared = holders.find((holder) => holder.files === wanted);
  if (shared) {
    shared.users += 1;
    return shared;
  }
  const name = chooseName(faces, family, incoming);
  const added = addFaces(doc, name, files);
  if (!added) return null;
  const holder: Held = {
    name,
    files: wanted,
    faces: added,
    loaded: loadFaces(added),
    users: 1,
  };
  faces.names.add(familyKey(name));
  holders.push(holder);
  families.set(key, holders);
  return holder;
}

function letGo(doc: Document, key: string, holder: Held): void {
  holder.users -= 1;
  if (holder.users > 0) return;
  for (const face of holder.faces) doc.fonts.delete(face);
  const { families, names } = facesOf(doc);
  names.delete(familyKey(holder.name));
  const holders = families.get(key);
  if (!holders) return;
  holders.splice(holders.indexOf(holder), 1);
  if (holders.length === 0) families.delete(key);
}

const NONE: FaceRegistration = {
  drawnFamily: (family) => family,
  renamed: false,
  loaded: Promise.resolve(new Set()),
  release: () => undefined,
};

async function refusedFamilies(
  doc: Document,
  holders: Map<string, Held>,
  refused: Set<string>,
): Promise<ReadonlySet<string>> {
  await Promise.all(
    Array.from(holders, async ([key, holder]) => {
      if (await holder.loaded) return;
      refused.add(key);
      // A refusal ends this surface's hold, allowing a later registration to retry the files.
      if (holders.delete(key)) letGo(doc, key, holder);
    }),
  );
  return refused;
}

/**
 * Adds a surface's served faces to its document, sharing those another surface drew from the same
 * files, until the surface releases them.
 */
export function registerFaces(doc: Document, fonts: FontFiles | null): FaceRegistration {
  if (!fonts?.faces.length || typeof FontFace === 'undefined' || !('fonts' in doc)) return NONE;
  const byFamily = new Map<string, { family: string; files: FontFaceFile[] }>();
  for (const face of uniqueFontFaces(fonts.faces, fontFaceKey)) {
    const key = familyKey(face.family);
    const entry = byFamily.get(key) ?? { family: face.family, files: [] };
    entry.files.push(face);
    byFamily.set(key, entry);
  }
  const holders = new Map<string, Held>();
  const incoming = new Set(byFamily.keys());
  const refused = new Set<string>();
  for (const [key, entry] of byFamily) {
    const holder = holdFamily(doc, entry, incoming);
    if (holder) holders.set(key, holder);
    else refused.add(key);
  }
  return {
    drawnFamily: (family) => holders.get(familyKey(family))?.name ?? family,
    get renamed() {
      return [...holders].some(([key, holder]) => familyKey(holder.name) !== key);
    },
    loaded: refusedFamilies(doc, holders, refused),
    release() {
      for (const [key, holder] of holders) letGo(doc, key, holder);
      holders.clear();
    },
  };
}

/** Whether a served face some surface added to the document is still loading. */
export function isLoadingFaces(doc: Document): boolean {
  for (const holders of held.get(doc)?.families.values() ?? [])
    for (const holder of holders)
      if (holder.faces.some((face) => face.status === 'loading')) return true;
  return false;
}
