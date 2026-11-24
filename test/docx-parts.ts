import { strFromU8, unzipSync } from 'fflate';

// The parts of a zip archive, as `writeZip` writes them, by path, as text.
export function readZipParts(bytes: Uint8Array): Map<string, string> {
  return new Map(Object.entries(unzipSync(bytes)).map(([path, data]) => [path, strFromU8(data)]));
}

/** How many times a pattern occurs in a text. */
export const countMatches = (value: string, pattern: RegExp): number =>
  [...value.matchAll(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`))].length;
