// Copying a link to the content: the element holding the selection, by its id, with the selected
// text's offsets in it when text is selected, handed to the host, which makes the link.

import type { EditorState } from 'prosemirror-state';
import { type EditAddress, selectionAddress } from '../../engine/index.js';

/** The address a link to the selection's content names; null outside any element with an id. */
export function contentLinkAddress(state: EditorState): EditAddress | null {
  const address = selectionAddress(state);
  if (!address || !state.selection.empty) return address;
  return { elementId: address.elementId };
}

/** Hands the host the address of the selection's content, when it is in an element with an id. */
export function copyContentLink(
  view: { readonly state: EditorState },
  onCopyLink: (address: EditAddress) => void,
): void {
  const address = contentLinkAddress(view.state);
  if (address) onCopyLink(address);
}
