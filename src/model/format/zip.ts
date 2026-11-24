// A zip archive of files, each deflated, as the formats built on zip read it, such as a word
// processing document. fflate writes it.

import { zipSync } from 'fflate';

/** A file to put in an archive: its path and its content. */
export interface ZipEntry {
  readonly path: string;
  readonly data: Uint8Array | string;
}

// A fixed date, 1 January 1980, so the same files make the same archive. Zip records local time,
// which fflate reads from the date in the time zone it runs in, so the date is local midnight.
const FIXED_DATE = new Date(1980, 0, 1);

/** An archive of the files, in order, each deflated. */
export function writeZip(entries: readonly ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const files = Object.fromEntries(
    entries.map((entry) => [
      entry.path,
      typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data,
    ]),
  );
  return zipSync(files, { level: 6, mtime: FIXED_DATE });
}
