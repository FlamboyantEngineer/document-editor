// The atom cache: the sizes of the atoms the engine sizes by a measurer of its own, such as math
// from its layout (DOCE-PAGINATION-12.10). Each atom is sized once and kept by its content, so the
// layout engine reads the same size for the same content without sizing it again. Nothing is read
// from the DOM, and a size never changes once kept: a provisional size, given before what sizes the
// atom is known, is never kept (DOCE-PAGINATION-12.13).

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { MathLayouts } from './math-atoms.js';

/** An atom's box in CSS pixels at a zoom of 1. */
export interface AtomSize {
  readonly width: number;
  readonly height: number;
  /** The distance from the box's top to its baseline, for an atom that sits on a text line. */
  readonly baseline?: number | undefined;
  /** Whether an inline atom is aligned to its line's top or bottom (`vertical-align`). */
  readonly align?: 'top' | 'bottom' | undefined;
  /** A block atom's outer margins as drawn, its content's margins that pass through its edges included. */
  readonly margins?: { readonly top: number; readonly bottom: number } | undefined;
  /** Math sized from its layout (DOCE-PAGINATION-12.10): the layout, which the engine may scale. */
  readonly math?: MathLayouts | undefined;
  /**
   * A size given before what sizes the atom is known, such as math's reserved box before its typeset
   * answer (DOCE-PAGINATION-12.13): never kept, so the atom is sized again once it is.
   */
  readonly provisional?: true | undefined;
}

/**
 * Where an atom is drawn, beside its width: the template section its page is in and, for an
 * inline atom, the text block holding it, whose font and marks it inherits.
 */
export interface AtomPlace {
  readonly scope?: string | null | undefined;
  readonly parent?: ProseMirrorNode | undefined;
  /** The width of the lines the atom is on, which a host's rule sizes it in. */
  readonly width?: number | undefined;
}

/** Where an atom is drawn, and the text a view draws in a leaf atom, such as a footnote number. */
interface AtomDrawing extends AtomPlace {
  readonly shown?: string | undefined;
}

/** Sizes one atom at an available width, where it is drawn; null when it cannot size it. */
export type AtomMeasurer = (
  node: ProseMirrorNode,
  width: number,
  drawing?: AtomDrawing,
) => AtomSize | null;

/** Where the atom cache gets its sizes from. */
interface AtomCacheOptions {
  readonly measure: AtomMeasurer;
  /**
   * The text a view draws in a leaf atom that the document does not hold, such as a footnote
   * marker's number (`numbersByNode`); an atom is kept by it as by its content.
   */
  readonly shownOf?: ((node: ProseMirrorNode) => string | undefined) | undefined;
  /** The most atoms kept; the least recently used go first. 2000 by default. */
  readonly limit?: number | undefined;
  /** Told each atom given a provisional size, which is not kept (DOCE-PAGINATION-12.13). */
  readonly provisional?: ((node: ProseMirrorNode) => void) | undefined;
}

/** The atom cache. */
export interface AtomCache {
  /** An inline atom's size in its text block and scope, for the text layout engine's `measureAtom`. */
  measureAtom(node: ProseMirrorNode, place?: AtomPlace): AtomSize | null;
  /** A block atom's size at an available width, such as an equation or an unsized image. */
  measureBlockAtom(node: ProseMirrorNode, width: number, scope?: string | null): AtomSize | null;
}

/** The default number of atoms a cache keeps. */
const DEFAULT_ATOM_CACHE_LIMIT = 2000;

// Attributes that say who wrote a node or where its fragment is, not what it shows.
const IDENTITY_ATTRS = new Set(['dataId', 'dataAuthor', 'dataAiSession', 'splitPartIndex']);

// An inline atom sits on a line of any width; measuring it at none lets it take its own size.
const INLINE_WIDTH = 0;

// Widths are kept to Chromium's layout unit, so a width that differs below it shares an entry.
const LAYOUT_UNITS_PER_PX = 64;

// The atoms whose content the engine lays out as text, not part of their box: a figure's caption.
const TEXT_CONTENT_ATOMS: ReadonlySet<string> = new Set(['figure']);

function contentAttrs(node: ProseMirrorNode): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(node.attrs)) {
    if (!IDENTITY_ATTRS.has(name)) attrs[name] = value;
  }
  return attrs;
}

/**
 * The key an atom is cached by: its type, the attributes that show, its marks and its content (but
 * not a figure's caption, which the engine lays out as text), the width it is laid out in, the text a view draws in it, if any, and where it is drawn: its scope
 * and the type and shown attributes of the text block holding it, whose font it takes. Two atoms
 * with the same key draw the same box.
 */
export function atomKey(node: ProseMirrorNode, width: number, drawing: AtomDrawing = {}): string {
  const { shown, ...place } = drawing;
  const units = Math.round(Math.max(0, width) * LAYOUT_UNITS_PER_PX);
  const parent = place.parent ? parentKey(place.parent) : 'null';
  const key = `[${ownKey(node)},${String(units)},${JSON.stringify(place.scope ?? null)},${parent}`;
  return shown === undefined ? `${key}]` : `${key},${JSON.stringify(shown)}]`;
}

// The parts of a key a node gives, serialized once for each node, which is never changed.
const ownKeys = new WeakMap<ProseMirrorNode, string>();
const parentKeys = new WeakMap<ProseMirrorNode, string>();

function ownKey(node: ProseMirrorNode): string {
  let key = ownKeys.get(node);
  if (key === undefined) {
    key = JSON.stringify([
      node.type.name,
      contentAttrs(node),
      node.marks.map((mark) => mark.toJSON() as unknown),
      TEXT_CONTENT_ATOMS.has(node.type.name) ? null : (node.content.toJSON() as unknown),
    ]).slice(1, -1);
    ownKeys.set(node, key);
  }
  return key;
}

function parentKey(parent: ProseMirrorNode): string {
  let key = parentKeys.get(parent);
  if (key === undefined) {
    key = JSON.stringify([parent.type.name, contentAttrs(parent)]);
    parentKeys.set(parent, key);
  }
  return key;
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

// A cached atom's size as an inline atom's: its box, baseline, alignment and math layout.
function inlineSize(size: AtomSize | null): AtomSize | null {
  if (!size) return null;
  const { width, height, baseline, align, math } = size;
  return {
    width,
    height,
    ...(baseline === undefined ? {} : { baseline }),
    ...(align ? { align } : {}),
    ...(math ? { math } : {}),
  };
}

/** Creates an atom cache over a measurer. */
export function createAtomCache({
  measure,
  shownOf,
  limit = DEFAULT_ATOM_CACHE_LIMIT,
  provisional,
}: AtomCacheOptions): AtomCache {
  const entries = new Map<string, AtomSize>();

  const keep = (key: string, size: AtomSize) => {
    entries.delete(key);
    entries.set(key, size);
    while (entries.size > Math.max(1, limit)) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  };

  const measured = (
    node: ProseMirrorNode,
    width: number,
    place: AtomPlace = {},
  ): AtomSize | null => {
    const shown = shownOf?.(node);
    const drawing = shown === undefined ? place : { ...place, shown };
    const key = atomKey(node, width, drawing);
    const cached = entries.get(key);
    if (cached) {
      keep(key, cached);
      return cached;
    }
    const size = measure(node, width, drawing);
    if (!isSize(size)) return null;
    if (size.provisional) provisional?.(node);
    else keep(key, size);
    return size;
  };

  return {
    measureAtom: (node, place) => inlineSize(measured(node, INLINE_WIDTH, place)),
    measureBlockAtom: (node, width, scope) => measured(node, width, { scope }),
  };
}
