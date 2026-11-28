// The changing set of faces an editor draws with. A registration holds a whole family so the
// editor can update its faces without disturbing a viewer sharing the previous version.

import { type FaceRegistration, registerFaces } from '../document/font-registry.js';
import type { FontFaceFile, FontFiles } from '../host/font-files.js';
import type { FontFileMeasurer } from '../layout-engine/font-files/measurer.js';
import { addFontGenerics, familyKey, fontFaceKey, uniqueFontFaces } from '../utils/font-keys.js';

/** The files and local family names in one rendering of the template. */
export interface ServedFontDrawing {
  readonly files: FontFiles;
  drawnFamily(family: string): string;
  /** The files under both their served names and the aliases this template draws with. */
  drawnFiles(): FontFiles;
  /** Gives up older registrations once the surface has applied this drawing's family names. */
  adopt(): void;
}

interface RegisteredFamily {
  readonly family: string;
  readonly files: readonly FontFaceFile[];
  readonly registration: FaceRegistration;
  readonly alias: string | undefined;
}

interface ServedFaces {
  readonly generics: Readonly<Record<string, string>>;
  isServed(family: string): boolean;
  files(): FontFiles;
  drawing(): ServedFontDrawing;
  add(files: FontFiles, skipped: ReadonlySet<number>): Promise<boolean>;
  destroy(): void;
}

type AddedFamily = [FontFaceFile, ...FontFaceFile[]];

function collectAdditions(
  files: FontFiles,
  skipped: ReadonlySet<number>,
  kept: ReadonlySet<string>,
) {
  const added = new Map<string, AddedFamily>();
  const readable = files.faces.filter((_, index) => !skipped.has(index));
  for (const face of uniqueFontFaces(readable, fontFaceKey)) {
    if (kept.has(fontFaceKey(face))) continue;
    const family = familyKey(face.family);
    const list = added.get(family);
    if (list) list.push(face);
    else added.set(family, [face]);
  }
  return added;
}

function registerFamily(
  doc: Document,
  previous: RegisteredFamily | undefined,
  incoming: AddedFamily,
): RegisteredFamily {
  const { family } = incoming[0];
  const files = [...(previous?.files ?? []), ...incoming];
  const registration = registerFaces(doc, { faces: files });
  const drawn = registration.drawnFamily(family);
  const alias = familyKey(drawn) === familyKey(family) ? undefined : drawn;
  return { family, files, registration, alias };
}

function releaseFamilies(families: Iterable<RegisteredFamily>): void {
  for (const { registration } of families) registration.release();
}

function captureDrawing(
  files: FontFiles,
  names: ReadonlyMap<string, string | undefined>,
  adopt: () => void,
): ServedFontDrawing {
  const usedAliases = new Set(
    [...names.values()].flatMap((name) => (name ? [familyKey(name)] : [])),
  );
  return {
    files,
    drawnFamily: (family) => names.get(familyKey(family)) ?? family,
    drawnFiles: () => ({
      ...files,
      faces: files.faces.flatMap((face) => {
        const key = familyKey(face.family);
        const alias = names.get(key);
        if (!alias) return [face];
        const drawn = { ...face, family: alias };
        // A canonical duplicate must never override another family's actual drawing name.
        return usedAliases.has(key) ? [drawn] : [face, drawn];
      }),
    }),
    adopt,
  };
}

/** Holds current and still-drawn registrations for the life of the editor (DOCE-PAGINATION-12.8). */
export function createServedFaces(doc: Document, measurer: FontFileMeasurer): ServedFaces {
  const current = new Map<string, RegisteredFamily>();
  const pending = new Map<string, RegisteredFamily>();
  const aliases = new Set<string>();
  const retired = new Set<RegisteredFamily>();
  const kept = new Set<string>();
  const generics: Record<string, string> = {};
  let destroyed = false;
  const install = async (additions: ReadonlyMap<string, AddedFamily>) => {
    try {
      for (const [key, faces] of additions)
        pending.set(key, registerFamily(doc, current.get(key), faces));
      const refused = await Promise.all(
        [...pending.values()].map(({ registration }) => registration.loaded),
      );
      const rejected = new Set(refused.flatMap((families) => [...families]));
      if (destroyed) return false;
      let installed = false;
      for (const [key, family] of pending) {
        if (rejected.has(key)) {
          family.registration.release();
          continue;
        }
        const previous = current.get(key);
        if (previous) retired.add(previous);
        current.set(key, family);
        installed = true;
        for (const face of additions.get(key) ?? []) kept.add(fontFaceKey(face));
        if (family.alias) aliases.add(familyKey(family.alias));
        measurer.alias(family.alias ?? family.family, family.family);
      }
      pending.clear();
      return installed;
    } finally {
      releaseFamilies(pending.values());
      pending.clear();
    }
  };
  const files = (): FontFiles => ({
    faces: [...current.values()].flatMap((family) => family.files),
    generics: { ...generics },
  });
  return {
    generics,
    isServed: (family) => current.has(familyKey(family)) || aliases.has(familyKey(family)),
    files,
    drawing() {
      const names = new Map([...current].map(([key, family]) => [key, family.alias]));
      const older = [...retired];
      return captureDrawing(files(), names, () => {
        for (const family of older) {
          if (!retired.delete(family)) continue;
          family.registration.release();
          if (family.alias) aliases.delete(familyKey(family.alias));
        }
        older.length = 0;
      });
    },
    async add(added, skipped) {
      if (destroyed) return false;
      const additions = collectAdditions(added, skipped, kept);
      const installed = await install(additions);
      if (destroyed) return false;
      const mapped = addFontGenerics(generics, added.generics ?? {}, (family) =>
        current.has(family),
      );
      return installed || mapped;
    },
    destroy() {
      destroyed = true;
      releaseFamilies(pending.values());
      releaseFamilies(current.values());
      releaseFamilies(retired);
      pending.clear();
      retired.clear();
    },
  };
}
