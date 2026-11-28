// Whether Pretext layout can start: the host's shaper and font files, asked for once (DOCE-HOST-1.14).
// Nothing is measured until both have arrived; until then, and when the host serves neither, the
// pages keep the browser's own layout and the phase says why. No fallback font is ever measured.

import type { FontsAdapter } from '../../host/adapters.js';
import type { FontFiles } from '../../host/font-files.js';
import { type ReadFace, readHostFaces } from './host-faces.js';
import { createFontFileMeasurer, type FontFileMeasurer } from './measurer.js';

/** Why Pretext layout is not on. */
type HostFontsReason =
  'pending' | 'no-shaper' | 'no-files' | 'shaper-failed' | 'files-failed' | 'no-faces';

type HostFonts =
  | { readonly phase: 'browser'; readonly reason: HostFontsReason }
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

/**
 * Prepares the host's shaper and the faces of `families` for a document to register, or gives the
 * reason the pages stay on the browser's layout. Never throws.
 */
export async function loadHostFonts(
  fonts: FontsAdapter | undefined,
  families: readonly string[],
  options: { signal?: AbortSignal | undefined } = {},
): Promise<HostFonts> {
  if (!fonts?.shaper) return { phase: 'browser', reason: 'no-shaper' };
  if (!fonts.files) return { phase: 'browser', reason: 'no-files' };
  // An adapter that throws rather than rejects fails the same way.
  const { shaper: askShaper, files: askFiles } = fonts;
  const [shaper, files] = await Promise.all([
    Promise.resolve()
      .then(() => askShaper.call(fonts, options))
      .catch(() => null),
    Promise.resolve()
      .then(() => askFiles.call(fonts, families, options))
      .catch(() => null),
  ]);
  if (!shaper?.ok) return { phase: 'browser', reason: 'shaper-failed' };
  if (!files?.ok || options.signal?.aborted) return { phase: 'browser', reason: 'files-failed' };
  try {
    const [measurer, { faces }] = await Promise.all([
      createFontFileMeasurer({ wasm: shaper.value, faces: [] }),
      readHostFaces(files.value),
    ]);
    if (!faces.length) return { phase: 'browser', reason: 'no-faces' };
    return { phase: 'pretext', measurer, faces, files: files.value };
  } catch {
    return { phase: 'browser', reason: 'shaper-failed' };
  }
}
