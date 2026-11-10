// A zip archive of stored files, without compression, as the formats built on zip read it, such
// as a word processing document: each file's local header and data, then the central directory.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** The CRC-32 of bytes, as zip records it. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** A file to put in an archive: its path and its content. */
export interface ZipEntry {
  readonly path: string;
  readonly data: Uint8Array | string;
}

// Writes little-endian numbers into a byte array.
function writer(size: number) {
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  let at = 0;
  return {
    bytes,
    u16: (value: number) => {
      view.setUint16(at, value, true);
      at += 2;
    },
    u32: (value: number) => {
      view.setUint32(at, value >>> 0, true);
      at += 4;
    },
    put: (data: Uint8Array) => {
      bytes.set(data, at);
      at += data.length;
    },
  };
}

// A fixed date, 1 January 1980, so the same files make the same archive.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

/** An archive of the files, stored without compression. */
export function writeZip(entries: readonly ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const files = entries.map((entry) => {
    const data = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data;
    return { name: encoder.encode(entry.path), data, crc: crc32(data) };
  });
  const locals = files.reduce((sum, file) => sum + 30 + file.name.length + file.data.length, 0);
  const central = files.reduce((sum, file) => sum + 46 + file.name.length, 0);
  const out = writer(locals + central + 22);
  const offsets: number[] = [];
  let offset = 0;
  for (const file of files) {
    offsets.push(offset);
    out.u32(0x04034b50);
    out.u16(20);
    out.u16(0x0800);
    out.u16(0);
    out.u16(DOS_TIME);
    out.u16(DOS_DATE);
    out.u32(file.crc);
    out.u32(file.data.length);
    out.u32(file.data.length);
    out.u16(file.name.length);
    out.u16(0);
    out.put(file.name);
    out.put(file.data);
    offset += 30 + file.name.length + file.data.length;
  }
  files.forEach((file, index) => {
    out.u32(0x02014b50);
    out.u16(20);
    out.u16(20);
    out.u16(0x0800);
    out.u16(0);
    out.u16(DOS_TIME);
    out.u16(DOS_DATE);
    out.u32(file.crc);
    out.u32(file.data.length);
    out.u32(file.data.length);
    out.u16(file.name.length);
    out.u16(0);
    out.u16(0);
    out.u16(0);
    out.u16(0);
    out.u32(0);
    out.u32(offsets[index] ?? 0);
    out.put(file.name);
  });
  out.u32(0x06054b50);
  out.u16(0);
  out.u16(0);
  out.u16(files.length);
  out.u16(files.length);
  out.u32(central);
  out.u32(offset);
  out.u16(0);
  return out.bytes;
}
