// What a paragraph's numbering means in a stored document: a list item (bulleted or numbered, at a
// depth, from a start number), a numbered paragraph level, or a heading's numbering, which the
// template gives and the reader ignores. The writer names its abstract numberings `Headings`,
// `Paragraphs`, `Bullets` and `Numbers`; any other numbering is a list.

import { childElement, childElements, childValue, type XmlElement } from '../xml-read.js';

/** What a paragraph's numbering makes it. */
export type NumberingRole =
  | {
      readonly kind: 'list';
      readonly ordered: boolean;
      readonly depth: number;
      readonly start: number;
      readonly list: string;
    }
  | { readonly kind: 'paragraph'; readonly level: number }
  | { readonly kind: 'heading' };

interface Level {
  readonly format: string;
  readonly start: number;
}

interface Abstract {
  readonly name: string;
  readonly levels: ReadonlyMap<number, Level>;
}

interface Instance {
  readonly abstract: string;
  readonly starts: ReadonlyMap<number, number>;
}

/** A document's numbering definitions. */
export interface DocxNumbering {
  /** The role of a paragraph's numbering (`w:numPr`); null when it is numbered by nothing. */
  readonly roleOf: (numPr: XmlElement | null) => NumberingRole | null;
}

// A list's start number: a whole number, or null for a missing or unreadable one.
function startOf(value: string | null): number | null {
  const start = Number(value ?? Number.NaN);
  return Number.isSafeInteger(start) && start >= 0 ? start : null;
}

const levelsOf = (element: XmlElement) =>
  new Map(
    childElements(element, 'w:lvl').map((level): [number, Level] => [
      Number(level.attrs['w:ilvl'] ?? 0),
      {
        format: childValue(level, 'w:numFmt') ?? 'decimal',
        start: startOf(childValue(level, 'w:start')) ?? 1,
      },
    ]),
  );

/** A document's numbering, from its numbering part (none when it has none). */
export function readNumbering(root: XmlElement | null): DocxNumbering {
  const abstracts = new Map<string, Abstract>(
    childElements(root, 'w:abstractNum').map((element): [string, Abstract] => [
      element.attrs['w:abstractNumId'] ?? '',
      { name: childValue(element, 'w:name') ?? '', levels: levelsOf(element) },
    ]),
  );
  const instances = new Map<string, Instance>(
    childElements(root, 'w:num').map((element): [string, Instance] => [
      element.attrs['w:numId'] ?? '',
      {
        abstract: childValue(element, 'w:abstractNumId') ?? '',
        starts: new Map(
          childElements(element, 'w:lvlOverride').flatMap((override): [number, number][] => {
            const start = childValue(override, 'w:startOverride');
            const value = startOf(start);
            return value === null ? [] : [[Number(override.attrs['w:ilvl'] ?? 0), value]];
          }),
        ),
      },
    ]),
  );
  return {
    roleOf: (numPr) => {
      const id = childValue(numPr, 'w:numId');
      const instance = id ? instances.get(id) : undefined;
      // numId 0 removes numbering a style gives.
      if (!id || id === '0' || !instance) return null;
      const depth = Math.min(8, Number(childValue(numPr, 'w:ilvl') ?? 0));
      const abstract = abstracts.get(instance.abstract);
      if (abstract?.name === 'Headings') return { kind: 'heading' };
      if (abstract?.name === 'Paragraphs')
        return { kind: 'paragraph', level: Math.min(6, depth + 1) };
      const level = abstract?.levels.get(depth);
      const ordered = !!level && !['bullet', 'none'].includes(level.format);
      const start = instance.starts.get(depth) ?? level?.start ?? 1;
      return { kind: 'list', ordered, depth, start, list: id };
    },
  };
}

/** A paragraph's own numbering properties, or null. */
export const numberingOf = (pPr: XmlElement | null) => childElement(pPr, 'w:numPr');
