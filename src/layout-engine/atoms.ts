// The atom cache: the sizes of what only the browser can size, such as an image without a stored
// size, an equation, an embed or a host's node view. Each atom is measured once in the DOM, by the
// host's measurer, and kept by its content, so the layout engine reads the same size for the same
// content without measuring again. An atom whose image still loads has a provisional size; when
// its final size arrives the cache keeps it and tells its listeners, which lay out again.

import type { Node as ProseMirrorNode } from 'prosemirror-model';

/** An atom's box in CSS pixels at a zoom of 1. */
export interface AtomSize {
  readonly width: number;
  readonly height: number;
  /** The distance from the box's top to its baseline, for an atom that sits on a text line. */
  readonly baseline?: number | undefined;
}

/** A cached atom's box, and whether it may still change. */
interface MeasuredAtom extends AtomSize {
  /** Whether an image in it still loads without a fixed box, so its final size may differ. */
  readonly provisional: boolean;
}

/** What a host's measurer reports for one atom. */
export interface AtomMeasure {
  readonly size: AtomSize;
  /** The final size once the atom's images load, when its size may still change. */
  readonly settled?: Promise<AtomSize> | undefined;
}

/** Measures one atom in the DOM at an available width; null when it cannot measure it. */
export type AtomMeasurer = (node: ProseMirrorNode, width: number) => AtomMeasure | null;

/** Where the atom cache gets its sizes from. */
interface AtomCacheOptions {
  readonly measure: AtomMeasurer;
  /** The most atoms kept; the least recently used go first. 2000 by default. */
  readonly limit?: number | undefined;
}

/** Called with the atoms whose final sizes arrived. */
type AtomListener = (nodes: readonly ProseMirrorNode[]) => void;

/** The atom cache. */
export interface AtomCache {
  /** An inline atom's size, for the text layout engine's `measureAtom`. */
  measureAtom(node: ProseMirrorNode): AtomSize | null;
  /** A block atom's size at an available width, such as an equation or an unsized image. */
  measureBlockAtom(node: ProseMirrorNode, width: number): MeasuredAtom | null;
  /** Listens for final sizes; returns the function that stops listening. */
  subscribe(listener: AtomListener): () => void;
}

/** The default number of atoms a cache keeps. */
const DEFAULT_ATOM_CACHE_LIMIT = 2000;

// Attributes that say who wrote a node or where its fragment is, not what it shows.
const IDENTITY_ATTRS = new Set(['dataId', 'dataAuthor', 'dataAiSession', 'splitPartIndex']);

// An inline atom sits on a line of any width; measuring it at none lets it take its own size.
const INLINE_WIDTH = 0;

// Widths are kept to Chromium's layout unit, so a width that differs below it shares an entry.
const LAYOUT_UNITS_PER_PX = 64;

function contentAttrs(node: ProseMirrorNode): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(node.attrs)) {
    if (!IDENTITY_ATTRS.has(name)) attrs[name] = value;
  }
  return attrs;
}

/**
 * The key an atom is cached by: its type, the attributes that show, its marks and its content, and
 * the width it is laid out in. Two atoms with the same key draw the same box.
 */
export function atomKey(node: ProseMirrorNode, width: number): string {
  const units = Math.round(Math.max(0, width) * LAYOUT_UNITS_PER_PX);
  return JSON.stringify([
    node.type.name,
    contentAttrs(node),
    node.marks.map((mark) => mark.toJSON() as unknown),
    node.content.toJSON() as unknown,
    units,
  ]);
}

function isSize(size: AtomSize | null | undefined): size is AtomSize {
  return (
    Boolean(size) &&
    Number.isFinite(size?.width) &&
    Number.isFinite(size?.height) &&
    (size?.width ?? -1) >= 0 &&
    (size?.height ?? -1) >= 0
  );
}

interface Entry {
  size: MeasuredAtom;
  readonly node: ProseMirrorNode;
}

/** Creates an atom cache over a host's measurer. */
export function createAtomCache({
  measure,
  limit = DEFAULT_ATOM_CACHE_LIMIT,
}: AtomCacheOptions): AtomCache {
  const entries = new Map<string, Entry>();
  const listeners = new Set<AtomListener>();

  const keep = (key: string, entry: Entry) => {
    entries.delete(key);
    entries.set(key, entry);
    while (entries.size > Math.max(1, limit)) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  };

  const settle = (key: string, entry: Entry, settled: Promise<AtomSize>) => {
    settled.then(
      (size) => {
        if (entries.get(key) !== entry) return;
        entry.size = isSize(size)
          ? { ...size, provisional: false }
          : { ...entry.size, provisional: false };
        for (const listener of [...listeners]) listener([entry.node]);
      },
      () => {
        // A failed load leaves the box the browser drew while it loaded, which is final.
        if (entries.get(key) === entry) entry.size = { ...entry.size, provisional: false };
      },
    );
  };

  const measured = (node: ProseMirrorNode, width: number): MeasuredAtom | null => {
    const key = atomKey(node, width);
    const cached = entries.get(key);
    if (cached) {
      keep(key, cached);
      return cached.size;
    }
    const result = measure(node, width);
    if (!result || !isSize(result.size)) return null;
    const entry: Entry = { node, size: { ...result.size, provisional: Boolean(result.settled) } };
    keep(key, entry);
    if (result.settled) settle(key, entry, result.settled);
    return entry.size;
  };

  return {
    measureAtom: (node) => {
      const size = measured(node, INLINE_WIDTH);
      if (!size) return null;
      const { width, height, baseline } = size;
      return baseline === undefined ? { width, height } : { width, height, baseline };
    },
    measureBlockAtom: measured,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
