// The fonts an editor's pages are laid out and drawn with under `textLayout: 'pretext'`
// (DOCE-HOST-1.14.1): every width from the font files the host serves, shaped by its HarfBuzz, and
// the same files drawn on the pages, added to the editor's document as faces of those families and
// taken out again when the editor goes. Without a shaper or the files, the pages keep the browser's
// own layout, and the reason says why; no other width source is used.

import type { MeasureContext } from '@chenglou/pretext';
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
  /** Asks the host for the families not asked for yet; true once some were added. */
  add(families: readonly string[]): Promise<boolean>;
  destroy(): void;
}

/** The pages' fonts under `textLayout: 'pretext'`, or why the browser lays them out. */
export type PagesFonts =
  ServedFonts | { readonly phase: 'browser'; readonly reason: BrowserLayoutReason };

const key = (family: string) =>
  family
    .trim()
    .replace(/^["']|["']$/gu, '')
    .toLowerCase();

// Draws a served face on the pages: the same bytes as measured, under the family the template
// names, so a local font of that name never draws instead.
async function drawnFace(face: FontFaceFile): Promise<FontFace | null> {
  if (typeof FontFace === 'undefined') return null;
  const drawn = new FontFace(face.family, face.bytes, {
    weight: String(face.weight),
    style: face.style,
    ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {}),
  });
  return drawn.load().catch(() => null);
}

// The faces and families of a host's files, as the pages hold them.
function createFaces(doc: Document) {
  const drawn: FontFace[] = [];
  const families = new Set<string>();
  const generics: Record<string, string> = {};
  const asked = new Set<string>();
  return {
    families,
    generics,
    asked,
    async add(files: FontFiles, skipped: ReadonlySet<number>) {
      const faces = files.faces.filter((_face, index) => !skipped.has(index));
      for (const face of faces) families.add(key(face.family));
      for (const [generic, family] of Object.entries(files.generics ?? {}))
        if (families.has(key(family))) generics[key(generic)] ??= family;
      for (const face of await Promise.all(faces.map(drawnFace))) {
        if (!face) continue;
        doc.fonts.add(face);
        drawn.push(face);
      }
    },
    destroy() {
      for (const face of drawn) doc.fonts.delete(face);
      drawn.length = 0;
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
    isFontServed: (family) => faces.families.has(key(family)),
    generics: faces.generics,
    async add(families) {
      const wanted = families.filter((family) => !faces.asked.has(key(family)));
      for (const family of wanted) faces.asked.add(key(family));
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
  const faces = createFaces(doc);
  for (const family of families) faces.asked.add(key(family));
  await faces.add(loaded.files, new Set(loaded.problems.map((problem) => problem.index)));
  const served = servedFonts(fonts, loaded.measurer, faces);
  if (signal?.aborted) served.destroy();
  return served;
}
