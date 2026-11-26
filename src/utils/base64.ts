// Bytes as base64 without a Node buffer. `String.fromCharCode` takes its arguments on the stack, so
// a large array is turned into characters a chunk at a time.

const CHUNK = 0x8000;

/** The bytes in base64. */
export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let at = 0; at < bytes.length; at += CHUNK)
    binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
  return btoa(binary);
}

/** The bytes base64 text holds, white space left out; throws on text that is not base64. */
export function decodeBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/\s+/g, ''));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
