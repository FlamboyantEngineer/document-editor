// Whether Pretext layout can start: the host's shaper and font files, asked for once (DOCE-HOST-1.14).
// Nothing is measured until both have arrived; until then, and when the host serves neither, the
// pages keep the browser's own layout and the phase says why. No fallback font is ever measured.

import type { FontsAdapter } from '../../host/adapters.js';
import type { FontFiles } from '../../host/font-files.js';
import { askBefore } from '../../utils/ask-before.js';
import { type ReadFace, readHostFaces } from './host-faces.js';
import { createFontFileMeasurer, type FontFileMeasurer } from './measurer.js';

/** Why Pretext layout is not on. */
type HostFontsReason =
  | 'pending'
  | 'no-shaper'
  | 'no-files'
  | 'shaper-failed'
  | 'files-failed'
  | 'timed-out'
  | 'no-faces';

type HostFonts =
  | {
      readonly phase: 'browser';
      readonly reason: HostFontsReason;
      /** Whether a request failed, so asking again may bring the fonts. */
      readonly retry?: boolean | undefined;
    }
  | {
      readonly phase: 'pretext';
      readonly measurer: FontFileMeasurer;
      /** The decoded files, pending the document's registration. */
      readonly faces: readonly ReadFace[];
      /** The original response, including files the measurer could not read. */
      readonly files: FontFiles;
    };

/** The browser's layout while the host's files are on their way. */
export const PENDING_FONTS: HostFonts = { phase: 'browser', reason: 'pending' };

// A failed request, which asking again may bring past.
const failed = (reason: 'shaper-failed' | 'files-failed'): HostFonts => ({
  phase: 'browser',
  reason,
  retry: true,
});
const timedOut: HostFonts = { phase: 'browser', reason: 'timed-out', retry: true };

/**
 * Prepares the host's shaper and the faces of `families` for a document to register, or gives the
 * reason the pages stay on the browser's layout: either not answered within `timeout` is
 * `timed-out`. Never throws.
 */
export async function loadHostFonts(
  fonts: FontsAdapter | undefined,
  families: readonly string[],
  { signal, timeout }: { signal?: AbortSignal | undefined; timeout: number },
): Promise<HostFonts> {
  if (!fonts?.shaper) return { phase: 'browser', reason: 'no-shaper' };
  if (!fonts.files) return { phase: 'browser', reason: 'no-files' };
  // An adapter that throws rather than rejects fails the same way.
  const { shaper: askShaper, files: askFiles } = fonts;
  const [shaper, files] = await Promise.all([
    askBefore((asked) => askShaper.call(fonts, { signal: asked }), { signal, timeout }),
    askBefore((asked) => askFiles.call(fonts, families, { signal: asked }), { signal, timeout }),
  ]);
  if (signal?.aborted) return { phase: 'browser', reason: 'files-failed' };
  if ([shaper, files].some((asked) => !asked.answered && asked.why === 'timed-out'))
    return timedOut;
  if (!shaper.answered || !shaper.value.ok) return failed('shaper-failed');
  if (!files.answered || !files.value.ok) return failed('files-failed');
  try {
    const [measurer, { faces }] = await Promise.all([
      createFontFileMeasurer({ wasm: shaper.value.value, faces: [] }),
      readHostFaces(files.value.value),
    ]);
    if (!faces.length) return { phase: 'browser', reason: 'no-faces' };
    return { phase: 'pretext', measurer, faces, files: files.value.value };
  } catch {
    // The shaper arrived but cannot run: asking again brings the same bytes.
    return { phase: 'browser', reason: 'shaper-failed' };
  }
}
