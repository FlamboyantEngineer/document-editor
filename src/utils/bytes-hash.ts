// A short key of some bytes' content, kept by the bytes' identity, so a host that hands the same file
// in a new buffer each time gets the same key, and one buffer is hashed once however often it is read.

// FNV-1a, 32 bits, as eight hex digits.
function fnv(view: Uint8Array): string {
  let hash = 0x811c9dc5;
  // An indexed loop: several times faster than an iterator over a large file.
  for (let index = 0; index < view.length; index += 1)
    hash = Math.imul(hash ^ (view[index] ?? 0), 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, '0');
}

const known = new WeakMap<object, string>();

/** The content key of some bytes: their length and an FNV-1a hash of them. */
export function bytesHash(bytes: ArrayBuffer | Uint8Array<ArrayBuffer>): string {
  let key = known.get(bytes);
  if (key === undefined) {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    key = `${String(view.byteLength)}:${fnv(view)}`;
    known.set(bytes, key);
  }
  return key;
}
