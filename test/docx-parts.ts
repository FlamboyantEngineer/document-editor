// The parts of a stored (uncompressed) zip archive, as `writeZip` writes them, by path.

export function readZipParts(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const files = new Map<string, string>();
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const name = decoder.decode(bytes.subarray(at + 30, at + 30 + nameLength));
    files.set(
      name,
      decoder.decode(bytes.subarray(at + 30 + nameLength, at + 30 + nameLength + size)),
    );
    at += 30 + nameLength + size;
  }
  return files;
}

/** How many times a pattern occurs in a text. */
export const countMatches = (value: string, pattern: RegExp): number =>
  [...value.matchAll(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`))].length;
