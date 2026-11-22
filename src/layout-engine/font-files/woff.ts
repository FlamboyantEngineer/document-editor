// WOFF 1.0 to an OpenType font: HarfBuzz reads only uncompressed font files, and the served fonts
// are WOFF, whose tables are zlib streams. The platform's DecompressionStream inflates them, in a
// page and in a worker alike. WOFF2 (Brotli and transformed tables) is not read here.

const HEADER = 44;
const ENTRY = 20;
const SFNT_HEADER = 12;
const SFNT_ENTRY = 16;

async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const padded = (length: number) => (length + 3) & ~3;

/** The font file inside a WOFF 1.0 file, or the bytes as they are when they are not WOFF. */
export async function readWoff(
  source: ArrayBuffer | Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < HEADER || view.getUint32(0) !== 0x774f4646) return bytes;
  const count = view.getUint16(12);
  const entries = Array.from({ length: count }, (_, index) => {
    const at = HEADER + index * ENTRY;
    return {
      tag: view.getUint32(at),
      offset: view.getUint32(at + 4),
      compressed: view.getUint32(at + 8),
      length: view.getUint32(at + 12),
      checksum: view.getUint32(at + 16),
    };
  });
  const tables = await Promise.all(
    entries.map(({ offset, compressed, length }) => {
      const data = bytes.subarray(offset, offset + compressed);
      return compressed < length ? inflate(data) : Promise.resolve(data);
    }),
  );
  let size = SFNT_HEADER + SFNT_ENTRY * count;
  for (const table of tables) size += padded(table.byteLength);
  const font = new Uint8Array(size);
  const out = new DataView(font.buffer);
  const power = 2 ** Math.floor(Math.log2(count));
  out.setUint32(0, view.getUint32(4));
  out.setUint16(4, count);
  out.setUint16(6, power * 16);
  out.setUint16(8, Math.log2(power));
  out.setUint16(10, count * 16 - power * 16);
  let offset = SFNT_HEADER + SFNT_ENTRY * count;
  entries.forEach(({ tag, checksum }, index) => {
    const table = tables[index] ?? new Uint8Array();
    const at = SFNT_HEADER + index * SFNT_ENTRY;
    out.setUint32(at, tag);
    out.setUint32(at + 4, checksum);
    out.setUint32(at + 8, offset);
    out.setUint32(at + 12, table.byteLength);
    font.set(table, offset);
    offset += padded(table.byteLength);
  });
  return font;
}
