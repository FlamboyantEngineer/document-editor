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
import { askBefore } from '../utils/ask-before.js';
import { familyKey } from '../utils/font-keys.js';
import { createServedFaces, type ServedFontDrawing } from './served-faces.js';

/** Why the pages keep the browser's layout under `textLayout: 'pretext'`. */
export type BrowserLayoutReason =
  'no-shaper' | 'no-files' | 'shaper-failed' | 'files-failed' | 'timed-out' | 'no-faces';

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
  | ServedFonts
  | {
      readonly phase: 'browser';
      readonly reason: BrowserLayoutReason;
      /** Whether a request failed or timed out, so asking again later may bring the fonts. */
      readonly retry?: boolean | undefined;
    };

/**
 * How long the host's shaper and font files are waited for before a request counts as failed, in
 * milliseconds (DOCE-PAGINATION-12.5).
 */
const SERVED_FONTS_TIMEOUT = 30_000;

const RETRY_AFTER = 1000;
const RETRY_AT_MOST = 60_000;

/**
 * How long after its `count`th failure in a row a request is made again: a second, twice as long
 * after each next failure, at most a minute (DOCE-PAGINATION-12.5).
 */
export const retryDelay = (count: number): number =>
  Math.min(RETRY_AFTER * 2 ** (Math.max(1, count) - 1), RETRY_AT_MOST);

function uniqueFamilies(families: readonly string[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const family of families) {
    const key = familyKey(family);
    if (!names.has(key)) names.set(key, family);
  }
  return names;
}

interface FontBatch {
  readonly changed: boolean;
  /** The families the answer brought faces or a generic's family for; every one when not given. */
  readonly delivered?: ReadonlySet<string> | undefined;
}

type LoadFamilies = (families: readonly string[]) => Promise<FontBatch | null>;

const NOTHING: FontBatch = { changed: false };

// The families an answer brought: each one it names a face of, read or not, since asking again
// brings the same bytes, and each generic mapped to an installed family.
function deliveredFamilies(
  files: FontFiles,
  generics: ServedFonts['generics'],
): ReadonlySet<string> {
  return new Set([...files.faces.map(({ family }) => familyKey(family)), ...Object.keys(generics)]);
}

interface FamilyRequests {
  /** The families already asked for, by key. */
  readonly initial: Iterable<string>;
  /** The ones among them the first answer brought. */
  readonly delivered: ReadonlySet<string>;
  readonly load: LoadFamilies;
  readonly retried: () => void;
}

// Overlapping requests share a batch. A batch whose transport fails is asked for again once it is
// due, by a timer of its own, and `retried` is told when that brings faces in. A family an answer
// left out is asked for again with the next request that names it once it is due.
function requestFamilies({ initial, delivered, load, retried }: FamilyRequests) {
  const requests = new Map<string, Promise<boolean> | null>();
  const failures = new Map<string, { count: number; at: number }>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let stopped = false;
  // Counts a family's failure and gives the count; the family may be asked for again once due.
  const fail = (key: string): number => {
    const count = (failures.get(key)?.count ?? 0) + 1;
    failures.set(key, { count, at: Date.now() + retryDelay(count) });
    requests.delete(key);
    return count;
  };
  const arrive = (key: string) => {
    failures.delete(key);
    requests.set(key, null);
  };
  for (const key of initial) {
    if (delivered.has(key)) arrive(key);
    else fail(key);
  }
  // Asks again for the families whose failure this timer is for; one that has failed again or
  // arrived since has a later timer of its own, or none.
  const retryLater = (failed: ReadonlyMap<string, { family: string; count: number }>) => {
    const delay = Math.max(...[...failed.values()].map(({ count }) => retryDelay(count)));
    const timer = setTimeout(() => {
      timers.delete(timer);
      const due: string[] = [];
      for (const [key, { family, count }] of failed) {
        const failure = failures.get(key);
        if (failure?.count !== count) continue;
        failure.at = 0;
        due.push(family);
      }
      if (stopped || !due.length) return;
      void request(due).then((changed) => {
        if (changed && !stopped) retried();
      });
    }, delay);
    timers.add(timer);
  };
  const settle = (wanted: ReadonlyMap<string, string>, batch: FontBatch | null) => {
    const failed = new Map<string, { family: string; count: number }>();
    for (const [key, family] of wanted) {
      if (!batch) failed.set(key, { family, count: fail(key) });
      else if (batch.delivered && !batch.delivered.has(key)) fail(key);
      else arrive(key);
    }
    if (failed.size && !stopped) retryLater(failed);
    return batch?.changed ?? false;
  };
  const request = async (families: readonly string[]): Promise<boolean> => {
    const wanted = uniqueFamilies(families);
    const waiting = new Set<Promise<boolean>>();
    for (const key of wanted.keys()) {
      const pending = requests.get(key);
      if (pending === undefined && Date.now() >= (failures.get(key)?.at ?? 0)) continue;
      wanted.delete(key);
      if (pending) waiting.add(pending);
    }
    if (wanted.size) {
      const batch = Promise.resolve()
        .then(() => load([...wanted.values()]))
        .catch(() => null)
        .then((batch) => settle(wanted, batch));
      for (const key of wanted.keys()) requests.set(key, batch);
      waiting.add(batch);
    }
    return (await Promise.all(waiting)).some(Boolean);
  };
  const stop = () => {
    stopped = true;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  };
  return { request, stop };
}

// The served fonts once loaded: more families asked for as the document names them.
function servedFonts(
  fonts: FontsAdapter,
  measurer: FontFileMeasurer,
  {
    faces,
    initial,
    initialFiles,
    signal,
    retried,
  }: {
    faces: ReturnType<typeof createServedFaces>;
    initial: Iterable<string>;
    initialFiles: FontFiles;
    signal?: AbortSignal | undefined;
    retried?: (() => void) | undefined;
  },
): ServedFonts {
  const files = fonts.files?.bind(fonts);
  let destroyed = false;
  const isDone = () => destroyed || signal?.aborted;
  let installing = Promise.resolve<FontBatch>(NOTHING);
  const asked = (wanted: readonly string[]) =>
    askBefore((aborted) => files?.(wanted, { signal: aborted }), {
      signal,
      timeout: SERVED_FONTS_TIMEOUT,
    });
  const load: LoadFamilies = async (wanted) => {
    if (!files || isDone()) return NOTHING;
    const answer = await asked(wanted);
    if (isDone()) return NOTHING;
    const result = answer.answered ? answer.value : undefined;
    if (!result?.ok) return null;
    const install = installing.then(async (): Promise<FontBatch> => {
      if (isDone()) return NOTHING;
      const { readHostFaces } = await import('../layout-engine/font-files/host-faces.js');
      const { faces: read } = await readHostFaces(result.value);
      if (isDone()) return NOTHING;
      const changed = await faces.add(read, result.value.generics);
      if (isDone()) return NOTHING;
      return { changed, delivered: deliveredFamilies(result.value, faces.generics) };
    });
    // Fetches may overlap; each batch finishes installing before the next one changes the faces.
    installing = install.catch(() => NOTHING);
    return install;
  };
  const families = requestFamilies({
    initial,
    delivered: deliveredFamilies(initialFiles, faces.generics),
    load,
    retried: () => {
      if (!isDone()) retried?.();
    },
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
    add: (wanted) => (isDone() ? Promise.resolve(false) : families.request(wanted)),
    destroy() {
      destroyed = true;
      families.stop();
      faces.destroy();
    },
  };
}

/**
 * Loads the host's shaper and the faces of `families`, adds the faces to `doc` for the pages to
 * draw, and gives the width source they are measured with; or why the browser lays the pages out.
 * A family whose files failed to arrive is asked for again on its own once due, and `retried` is
 * told each time that brings faces in (DOCE-PAGINATION-12.5).
 */
export async function loadPagesFonts(
  fonts: FontsAdapter | undefined,
  families: readonly string[],
  {
    doc,
    signal,
    retried,
  }: { doc: Document; signal?: AbortSignal | undefined; retried?: (() => void) | undefined },
): Promise<PagesFonts> {
  // The shaper and its measurer load only with the option on, as the engine does.
  const { loadHostFonts } = await import('../layout-engine/font-files/host-fonts.js');
  const initial = uniqueFamilies(families);
  const loaded = await loadHostFonts(fonts, [...initial.values()], {
    signal,
    timeout: SERVED_FONTS_TIMEOUT,
  });
  if (loaded.phase === 'browser' || !fonts) {
    const reason = loaded.phase === 'browser' ? loaded.reason : 'no-shaper';
    const retry = loaded.phase === 'browser' && Boolean(loaded.retry);
    return { phase: 'browser', reason: reason === 'pending' ? 'no-files' : reason, retry };
  }
  const faces = createServedFaces(doc, loaded.measurer, signal);
  const serve = () =>
    servedFonts(fonts, loaded.measurer, {
      faces,
      initial: initial.keys(),
      initialFiles: loaded.files,
      signal,
      retried,
    });
  // Fonts asked for by an editor that has gone, or that asks another adapter now, never draw: the
  // load comes back destroyed.
  const gone = () => {
    const served = serve();
    served.destroy();
    return served;
  };
  if (signal?.aborted) return gone();
  try {
    await faces.add(loaded.faces, loaded.files.generics);
  } catch {
    faces.destroy();
    return { phase: 'browser', reason: 'shaper-failed', retry: false };
  }
  if (signal?.aborted) return gone();
  if (!faces.files().faces.length) {
    faces.destroy();
    return { phase: 'browser', reason: 'no-faces', retry: false };
  }
  return serve();
}
