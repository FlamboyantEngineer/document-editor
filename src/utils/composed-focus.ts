// Where focus is, seen through shadow roots: inside one, the document's `activeElement` is the
// shadow host, so the focused element is read from root to root.

/** The element that has focus in a document, inside shadow roots too, or null. */
export function getComposedActiveElement(document: Document): Element | null {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}

/** Whether nothing in a document has focus: focus has fallen back to its body. */
export function isFocusLost(document: Document): boolean {
  const active = getComposedActiveElement(document);
  return !active || active === document.body;
}
