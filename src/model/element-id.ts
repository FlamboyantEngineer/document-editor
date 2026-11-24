// The form of an element id and how a fresh one is made, shared by the editor, the stored format
// and the importers (DOCE-EDITING-1.1). It reads no DOM, so a server makes the same ids.

/** What an element id looks like: eight lower-case hexadecimal digits. */
export const ELEMENT_ID_PATTERN = /^[a-f0-9]{8}$/;

/** A fresh random element id. */
export function createElementId(): string {
  const [value = 0] = crypto.getRandomValues(new Uint32Array(1));
  return value.toString(16).padStart(8, '0');
}
