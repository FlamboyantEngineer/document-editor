// Whether Pretext layout can start: the host's shaper and font files, asked for once (DOCE-HOST-1.14).
// Nothing is measured until both have arrived; until then, and when the host serves neither, the
// pages keep the browser's own layout and the phase says why. No fallback font is ever measured.

import type { FontsAdapter } from '../../host/adapters.js';
import type { FontFiles } from '../../host/font-files.js';
import type { FontFaceProblem } from './host-faces.js';
import { createHostMeasurer, type FontFileMeasurer } from './measurer.js';

/** Why Pretext layout is not on. */
type HostFontsReason =
  'pending' | 'no-shaper' | 'no-files' | 'shaper-failed' | 'files-failed' | 'no-faces';

type HostFonts =
  | { readonly phase: 'browser'; readonly reason: HostFontsReason }
  | {
      readonly phase: 'pretext';
      readonly measurer: FontFileMeasurer;
      /** The files the host served, for the pages to draw the same faces. */
      readonly files: FontFiles;
      readonly problems: readonly FontFaceProblem[];
    };

/** The browser's layout while the host's files are on their way. */
export const PENDING_FONTS: HostFonts = { phase: 'browser', reason: 'pending' };

/**
 * The measurer once the host's shaper and the faces of `families` have both arrived, or the reason
 * the pages stay on the browser's layout. Never throws.
 */
export async function loadHostFonts(
  fonts: FontsAdapter | undefined,
  families: readonly string[],
  options: { signal?: AbortSignal | undefined } = {},
): Promise<HostFonts> {
  if (!fonts?.shaper) return { phase: 'browser', reason: 'no-shaper' };
  if (!fonts.files) return { phase: 'browser', reason: 'no-files' };
  const [shaper, files] = await Promise.all([
    fonts.shaper(options).catch(() => null),
    fonts.files(families, options).catch(() => null),
  ]);
  if (!shaper?.ok) return { phase: 'browser', reason: 'shaper-failed' };
  if (!files?.ok) return { phase: 'browser', reason: 'files-failed' };
  try {
    const { measurer, problems } = await createHostMeasurer(shaper.value, files.value);
    if (problems.length === files.value.faces.length)
      return { phase: 'browser', reason: 'no-faces' };
    return { phase: 'pretext', measurer, files: files.value, problems };
  } catch {
    return { phase: 'browser', reason: 'shaper-failed' };
  }
}
