// The fonts an editor's pages are laid out and drawn with under `textLayout: 'pretext'`
// (DOCE-HOST-1.14.1): every width from the font files the host serves, shaped by its HarfBuzz, and
// the same files drawn on the pages, added to the editor's document as faces of those families and
// taken out again when the editor goes. Without a shaper or the files, the pages keep the browser's
// own layout, and the reason says why; no other width source is used.

import type { MeasureContext } from '@chenglou/pretext';
import { type FaceRegistration, familyKey, registerFaces } from '../document/font-registry.js';
import type { FontsAdapter } from '../host/adapters.js';
import type { FontFaceFile, FontFiles } from '../host/font-files.js';
import type { FontFileMeasurer } from '../layout-engine/font-files/measurer.js';
import type { ReserveCluster } from '../layout-engine/reserved-boxes.js';

/** Why the pages keep the browser's layout under `textLayout: 'pretext'`. */
export type BrowserLayoutReason =
  'no-shaper' | 'no-files' | 'shaper-failed' | 'files-failed' | 'no-faces';

/** The served fonts the pages measure and draw with. */
export interface ServedFonts {
  readonly phase: 'pretext';
  /** Pretext's width source, from the served files only. */
  readonly measureContext: () => MeasureContext;
  /** Whether a family has served faces; a generic keyword is drawn as the browser picks, so never. */
  isFontServed(family: string): boolean;
  /** The width a cluster no served face draws whole takes (DOCE-PAGINATION-12.4). */
  readonly reserve: ReserveCluster;
  /** The served family each generic keyword stands for, as the pages draw it (`servedTemplate`). */
  readonly generics: Readonly<Record<string, string>>;
  /** The faces the pages measure and draw with, and the family each generic stands for. */
  files(): FontFiles;
  /**
   * The family the pages draw a served family under: itself, or one of the editor's own while
   * another surface of the document draws other files under it (DOCE-PAGINATION-12.8).
   */
  drawnFamily(family: string): string;
  /** The faces as `files` gives them, and again under each family the pages draw under another. */
  drawnFiles(): FontFiles;
  /** Asks the host for the families not asked for yet; true once some were added. */
  add(families: readonly string[]): Promise<boolean>;
  destroy(): void;
}

/** The pages' fonts under `textLayout: 'pretext'`, or why the browser lays them out. */
export type PagesFonts =
  ServedFonts | { readonly phase: 'browser'; readonly reason: BrowserLayoutReason };

const sameFace = (one: FontFaceFile, other: FontFaceFile) =>
  one.bytes === other.bytes &&
  familyKey(one.family) === familyKey(other.family) &&
  one.weight === other.weight &&
  one.style === other.style &&
  one.unicodeRange === other.unicodeRange;

// The faces and families of a host's files, as the pages hold them: the files drawn on the pages
// through the document's face registry, under the family the template names, so a local font of
// that name never draws instead, or under one of the editor's own when another surface of the
// document draws other files under it, which the measurer then measures as that family
// (DOCE-PAGINATION-12.8).
function createFaces(doc: Document, measurer: FontFileMeasurer) {
  const registrations: FaceRegistration[] = [];
  const served: FontFaceFile[] = [];
  const families = new Set<string>();
  const drawnAs = new Map<string, string>();
  const generics: Record<string, string> = {};
  const asked = new Set<string>();
  let destroyed = false;
  return {
    families,
    generics,
    asked,
    served,
    drawnFamily: (family: string) => drawnAs.get(familyKey(family)) ?? family,
    // The faces under the families the pages draw them in, as a snapshot of the pages prints them.
    drawnFiles: (): FontFiles => ({
      faces: served.flatMap((face) => {
        const drawn = drawnAs.get(familyKey(face.family));
        return drawn ? [face, { ...face, family: drawn }] : [face];
      }),
      generics: { ...generics },
    }),
    async add(files: FontFiles, skipped: ReadonlySet<number>) {
      if (destroyed) return;
      // A face a family was served with already, asked for again by another name, is kept once.
      const faces = files.faces.filter(
        (face, index) => !skipped.has(index) && !served.some((kept) => sameFace(kept, face)),
      );
      served.push(...faces);
      for (const face of faces) families.add(familyKey(face.family));
      for (const [generic, family] of Object.entries(files.generics ?? {}))
        if (families.has(familyKey(family))) generics[familyKey(generic)] ??= family;
      const registration = registerFaces(doc, { faces });
      registrations.push(registration);
      for (const face of faces) {
        const drawn = registration.drawnFamily(face.family);
        if (familyKey(drawn) === familyKey(face.family)) continue;
        drawnAs.set(familyKey(face.family), drawn);
        families.add(familyKey(drawn));
        measurer.alias(drawn, face.family);
      }
      await registration.loaded;
    },
    destroy() {
      destroyed = true;
      for (const registration of registrations) registration.release();
      registrations.length = 0;
    },
  };
}

// The served fonts once loaded: more families asked for as the document names them.
function servedFonts(
  fonts: FontsAdapter,
  measurer: FontFileMeasurer,
  faces: ReturnType<typeof createFaces>,
): ServedFonts {
  const files = fonts.files?.bind(fonts);
  let destroyed = false;
  return {
    phase: 'pretext',
    measureContext: () => measurer.createContext() as unknown as MeasureContext,
    reserve: measurer.reserve,
    isFontServed: (family) => faces.families.has(familyKey(family)),
    generics: faces.generics,
    files: () => ({ faces: [...faces.served], generics: { ...faces.generics } }),
    drawnFamily: faces.drawnFamily,
    drawnFiles: faces.drawnFiles,
    async add(families) {
      const wanted = families.filter((family) => !faces.asked.has(familyKey(family)));
      for (const family of wanted) faces.asked.add(familyKey(family));
      if (!wanted.length || !files || destroyed) return false;
      const result = await files(wanted, {}).catch(() => null);
      if (!result?.ok || destroyed) return false;
      const problems = await measurer.addFiles(result.value);
      await faces.add(result.value, new Set(problems.map((problem) => problem.index)));
      return !destroyed;
    },
    destroy() {
      destroyed = true;
      faces.destroy();
    },
  };
}

/**
 * Loads the host's shaper and the faces of `families`, adds the faces to `doc` for the pages to
 * draw, and gives the width source they are measured with; or why the browser lays the pages out.
 */
export async function loadPagesFonts(
  fonts: FontsAdapter | undefined,
  families: readonly string[],
  { doc, signal }: { doc: Document; signal?: AbortSignal | undefined },
): Promise<PagesFonts> {
  // The shaper and its measurer load only with the option on, as the engine does.
  const { loadHostFonts } = await import('../layout-engine/font-files/host-fonts.js');
  const loaded = await loadHostFonts(fonts, families, { signal });
  if (loaded.phase === 'browser' || !fonts) {
    const reason = loaded.phase === 'browser' ? loaded.reason : 'no-shaper';
    return { phase: 'browser', reason: reason === 'pending' ? 'no-files' : reason };
  }
  const faces = createFaces(doc, loaded.measurer);
  const served = servedFonts(fonts, loaded.measurer, faces);
  // Fonts asked for by an editor that has gone, or that asks another adapter now, never draw.
  if (signal?.aborted) {
    served.destroy();
    return served;
  }
  for (const family of families) faces.asked.add(familyKey(family));
  await faces.add(loaded.files, new Set(loaded.problems.map((problem) => problem.index)));
  if (signal?.aborted) served.destroy();
  return served;
}
