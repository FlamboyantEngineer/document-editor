// A snapshot made once the pages are ready to print: laid out with no layout due, in the fonts
// they show, with each image's address resolved by a host that answers later, such as one that
// signs an address or reads an image into data.

import type { EditorView } from 'prosemirror-view';
import { documentSnapshot, type SnapshotOptions } from './snapshot.js';

/** The address a printed image loads from, given the one the pages show; null keeps it. */
export type ResolveImageAsync = (src: string) => Promise<string | null> | string | null;

/** What a snapshot made once the pages are ready holds, and what it waits for. */
export interface ReadySnapshotOptions extends Omit<SnapshotOptions, 'resolveImage'> {
  /** Resolves once the pages are laid out with no layout due (the handle's `whenSettled`). */
  readonly whenSettled: () => Promise<unknown>;
  /** The address each image prints from; it may answer later. */
  readonly resolveImage?: ResolveImageAsync | undefined;
}

// Each image address the pages show, with the address it prints from, resolved together.
async function resolveImages(
  view: EditorView,
  resolve: ResolveImageAsync,
): Promise<ReadonlyMap<string, string | null>> {
  const sources = new Set<string>();
  for (const image of view.dom.querySelectorAll('img')) {
    const src = image.getAttribute('src');
    if (src) sources.add(src);
  }
  const resolved = await Promise.all([...sources].map(async (src) => [src, await resolve(src)]));
  return new Map(resolved as [string, string | null][]);
}

/**
 * The document as its pages show it once they are ready to print: after the pages settle and the
 * fonts load, with each image's address as `resolveImage` resolves it (`documentSnapshot`).
 */
export async function documentSnapshotWhenReady(
  view: EditorView,
  { whenSettled, resolveImage, ...options }: ReadySnapshotOptions,
): Promise<string> {
  await whenSettled();
  await view.dom.ownerDocument.fonts?.ready;
  const images = resolveImage ? await resolveImages(view, resolveImage) : null;
  return documentSnapshot(view, {
    ...options,
    ...(images ? { resolveImage: (src: string) => images.get(src) ?? null } : {}),
  });
}
