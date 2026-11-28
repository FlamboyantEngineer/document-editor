// A snapshot made once the pages are ready to print: laid out with no layout due, in the fonts
// they show, with each image's address resolved by a host that answers later, such as one that
// signs an address or reads an image into data.

import type { EditorView } from 'prosemirror-view';
import { captureDocumentSnapshot, type SnapshotOptions } from './snapshot.js';

/** The address a printed image loads from, given the one the pages show; null keeps it. */
export type ResolveImageAsync = (src: string) => Promise<string | null> | string | null;

/** What a snapshot made once the pages are ready holds, and what it waits for. */
export interface ReadySnapshotOptions extends Omit<SnapshotOptions, 'resolveImage'> {
  /** Resolves once the pages are laid out with no layout due (the handle's `whenSettled`). */
  readonly whenSettled: () => Promise<unknown>;
  /** The address each image prints from; it may answer later. */
  readonly resolveImage?: ResolveImageAsync | undefined;
}

interface LiveSnapshotOptions extends Pick<ReadySnapshotOptions, 'whenSettled' | 'resolveImage'> {
  readonly checkView: () => void;
  readonly readSnapshot: () => SnapshotOptions;
  readonly waitForDocumentFonts: () => boolean;
}

// Each image address the pages show, with the address it prints from, resolved together.
async function resolveImages(
  pages: Element,
  resolve: ResolveImageAsync,
): Promise<ReadonlyMap<string, string | null>> {
  const sources = new Set<string>();
  for (const image of pages.querySelectorAll('img')) {
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
  options: ReadySnapshotOptions,
): Promise<string> {
  return snapshotOnceReady(view, options, (take) => take());
}

/**
 * `documentSnapshotWhenReady`, its snapshot taken inside `around`, as with the pages laid out in
 * the snapshot's markup for that moment.
 */
export async function snapshotOnceReady(
  view: EditorView,
  { whenSettled, resolveImage, ...options }: ReadySnapshotOptions | LiveSnapshotOptions,
  around: (
    take: () => ReturnType<typeof captureDocumentSnapshot>,
  ) => ReturnType<typeof captureDocumentSnapshot>,
): Promise<string> {
  const waitForLayout = async () => {
    if ((await whenSettled()) === 'failed' || view.isDestroyed)
      throw new Error('The document layout is unavailable.');
  };
  await waitForLayout();
  const live = 'readSnapshot' in options;
  const documentFonts =
    !live || options.waitForDocumentFonts() ? view.dom.ownerDocument.fonts : null;
  if (documentFonts?.status === 'loading') {
    await documentFonts.ready;
    await waitForLayout();
  }
  const captured = around(() =>
    captureDocumentSnapshot(view, live ? options.readSnapshot() : options),
  );
  if (!resolveImage) return captured.html();
  const images = await resolveImages(captured.pages, resolveImage);
  if (view.isDestroyed) throw new Error('The document layout is unavailable.');
  if (live) options.checkView();
  return captured.html((src) => images.get(src) ?? null);
}
