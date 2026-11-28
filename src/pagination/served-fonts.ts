// The fonts an editor's pages are laid out and drawn with under `textLayout: 'pretext'`
// (DOCE-HOST-1.14.1): every width from the font files the host serves, shaped by its HarfBuzz, and
// the same files drawn on the pages, added to the editor's document as faces of those families and
// taken out again when the editor goes. Without a shaper or the files, the pages keep the browser's
// own layout, and the reason says why; no other width source is used.

import type { MeasureContext } from '@chenglou/pretext';
import type { FontsAdapter } from '../host/adapters.js';
import type { FontFiles } from '../host/font-files.js';
import type { FontFileMeasurer } from '../layout-engine/font-files/measurer.js';
import type { ReserveCluster } from '../layout-engine/reserved-boxes.js';
import { familyKey } from '../utils/font-keys.js';
import { createServedFaces, type ServedFontDrawing } from './served-faces.js';

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
  /**
   * Records the characters of something drawn with no glyph to draw them, such as math the math
   * layouter has none for (DOCE-PAGINATION-12.9), as the measurer's missing glyphs.
   */
  missing(text: string): void;
  /** The served family each generic keyword stands for, as the pages draw it (`servedTemplate`). */
  readonly generics: Readonly<Record<string, string>>;
  /** The faces the pages measure and draw with, and the family each generic stands for. */
  files(): FontFiles;
  /** The files and local family names of a template drawn with the currently loaded faces. */
  drawing(): ServedFontDrawing;
  /** Waits for the requested families' new or pending loads; true if they changed the fonts. */
  add(families: readonly string[]): Promise<boolean>;
  destroy(): void;
}

/** The pages' fonts under `textLayout: 'pretext'`, or why the browser lays them out. */
export type PagesFonts =
  ServedFonts | { readonly phase: 'browser'; readonly reason: BrowserLayoutReason };

const RETRY_AFTER = 1000;
const RETRY_AT_MOST = 60_000;

function uniqueFamilies(families: readonly string[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const family of families) {
    const key = familyKey(family);
    if (!names.has(key)) names.set(key, family);
  }
  return names;
}

// Overlapping requests share a batch. Transport failures retry with backoff.
function requestFamilies(
  initial: readonly string[],
  load: (families: readonly string[]) => Promise<boolean | null>,
) {
  const requests = new Map<string, Promise<boolean> | null>(
    initial.map((family) => [familyKey(family), null]),
  );
  const failures = new Map<string, { count: number; at: number }>();
  return async (families: readonly string[]): Promise<boolean> => {
    const wanted = uniqueFamilies(families);
    const waiting = new Set<Promise<boolean>>();
    for (const key of wanted.keys()) {
      const request = requests.get(key);
      if (request === undefined && Date.now() >= (failures.get(key)?.at ?? 0)) continue;
      wanted.delete(key);
      if (request) waiting.add(request);
    }
    if (wanted.size) {
      const batch = Promise.resolve()
        .then(() => load([...wanted.values()]))
        .catch(() => null)
        .then((changed) => {
          for (const key of wanted.keys()) {
            if (changed === null) {
              const count = (failures.get(key)?.count ?? 0) + 1;
              const delay = Math.min(RETRY_AFTER * 2 ** (count - 1), RETRY_AT_MOST);
              failures.set(key, { count, at: Date.now() + delay });
              requests.delete(key);
            } else {
              failures.delete(key);
              requests.set(key, null);
            }
          }
          return changed ?? false;
        });
      for (const key of wanted.keys()) requests.set(key, batch);
      waiting.add(batch);
    }
    return (await Promise.all(waiting)).some(Boolean);
  };
}

// The served fonts once loaded: more families asked for as the document names them.
function servedFonts(
  fonts: FontsAdapter,
  measurer: FontFileMeasurer,
  {
    faces,
    initial,
    signal,
  }: {
    faces: ReturnType<typeof createServedFaces>;
    initial: readonly string[];
    signal?: AbortSignal | undefined;
  },
): ServedFonts {
  const files = fonts.files?.bind(fonts);
  let destroyed = false;
  const isDone = () => destroyed || signal?.aborted;
  let installing = Promise.resolve(false);
  const add = requestFamilies(initial, async (wanted) => {
    if (!files || isDone()) return false;
    const result = await files(wanted, { signal });
    if (isDone()) return false;
    if (!result.ok) return null;
    const install = installing.then(async () => {
      if (isDone()) return false;
      const problems = await measurer.addFiles(result.value);
      if (isDone()) return false;
      const changed = await faces.add(result.value, new Set(problems.map(({ index }) => index)));
      return changed && !isDone();
    });
    // Fetches may overlap; each batch finishes installing before the next one changes the faces.
    installing = install.catch(() => false);
    return install;
  });
  return {
    phase: 'pretext',
    measureContext: () => measurer.createContext() as unknown as MeasureContext,
    reserve: measurer.reserve,
    missing: (text) => {
      for (const character of text)
        measurer.problems.missingGlyphs.add(character.codePointAt(0) ?? 0);
    },
    isFontServed: faces.isServed,
    generics: faces.generics,
    files: faces.files,
    drawing: faces.drawing,
    add: (families) => (isDone() ? Promise.resolve(false) : add(families)),
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
  const initial = [...uniqueFamilies(families).values()];
  const loaded = await loadHostFonts(fonts, initial, { signal });
  if (loaded.phase === 'browser' || !fonts) {
    const reason = loaded.phase === 'browser' ? loaded.reason : 'no-shaper';
    return { phase: 'browser', reason: reason === 'pending' ? 'no-files' : reason };
  }
  const faces = createServedFaces(doc, loaded.measurer);
  const served = servedFonts(fonts, loaded.measurer, { faces, initial, signal });
  // Fonts asked for by an editor that has gone, or that asks another adapter now, never draw.
  if (signal?.aborted) {
    served.destroy();
    return served;
  }
  await faces.add(loaded.files, new Set(loaded.problems.map((problem) => problem.index)));
  if (signal?.aborted) served.destroy();
  else if (!faces.files().faces.length) {
    served.destroy();
    return { phase: 'browser', reason: 'no-faces' };
  }
  return served;
}
