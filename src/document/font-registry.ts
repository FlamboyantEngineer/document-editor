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
function addFaces(doc: Document, name: string, files: readonly FontFaceFile[]): FontFace[] {
  const faces = files.map(
    (file) =>
      new FontFace(name, file.bytes, {
        weight: String(file.weight),
        style: file.style,
        ...(file.unicodeRange ? { unicodeRange: file.unicodeRange } : {}),
      }),
  );
  for (const face of faces) doc.fonts.add(face);
  return faces;
}

// The faces of one family's files: those another surface holds for the same files, or new ones,
// under the family when no surface holds it, else under a family of the surface's own.
function holdFamily(
  doc: Document,
  { family, files }: { family: string; files: readonly FontFaceFile[] },
  incoming: ReadonlySet<string>,
): Held {
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
  const holder: Held = { name, files: wanted, faces: addFaces(doc, name, files), users: 1 };
  faces.names.add(familyKey(name));
  holders.push(holder);
  families.set(key, holders);
  return holder;
}

function letGo(doc: Document, family: string, holder: Held): void {
  holder.users -= 1;
  if (holder.users > 0) return;
  for (const face of holder.faces) doc.fonts.delete(face);
  const { families, names } = facesOf(doc);
  names.delete(familyKey(holder.name));
  const key = familyKey(family);
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
  for (const face of uniqueFontFaces(fonts.faces, fontFaceKey)) {
    const key = familyKey(face.family);
    const entry = byFamily.get(key) ?? { family: face.family, files: [] };
    entry.files.push(face);
    byFamily.set(key, entry);
  }
  const holders = new Map<string, { family: string; holder: Held }>();
  const incoming = new Set(byFamily.keys());
  for (const [key, entry] of byFamily)
    holders.set(key, { family: entry.family, holder: holdFamily(doc, entry, incoming) });
  const loaded = refusedFamilies(doc, [...holders]);
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
  for (const holders of held.get(doc)?.families.values() ?? [])
    for (const holder of holders)
      if (holder.faces.some((face) => face.status === 'loading')) return true;
  return false;
}
