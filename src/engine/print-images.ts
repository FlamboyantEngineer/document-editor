// The images a snapshot prints: loaded at once rather than when scrolled to, since a printed page
// is never scrolled to, and from the address the host gives, such as one a server can reach.

/** The address a printed image loads from, given the one the pages show; null keeps it. */
export type ResolveImage = (src: string) => string | null;

/** Makes a copy of the pages' images load eagerly, from the addresses `resolveImage` gives. */
export function prepareSnapshotImages(copy: Element, resolveImage?: ResolveImage): void {
  for (const image of copy.querySelectorAll('img')) {
    image.setAttribute('loading', 'eager');
    image.setAttribute('decoding', 'sync');
    const src = image.getAttribute('src');
    const resolved = src && resolveImage ? resolveImage(src) : null;
    if (resolved !== null && resolved !== src) {
      image.setAttribute('src', resolved);
      image.removeAttribute('srcset');
    }
  }
}
