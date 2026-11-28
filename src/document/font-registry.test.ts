// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { FontFaceFile } from '../host/font-files.js';
import { registerFaces } from './font-registry.js';

// A document whose face set the test reads, with faces the browser loads unless told to refuse.
function browserDocument(refuse: ReadonlySet<string> = new Set()) {
  const made: string[] = [];
  class Face {
    constructor(
      readonly family: string,
      _bytes: unknown,
      readonly descriptors: FontFaceDescriptors = {},
    ) {
      made.push(family);
    }
    // Refused by family, or by family and weight.
    load() {
      const weighted = `${this.family} ${this.descriptors.weight ?? '400'}`;
      return refuse.has(this.family) || refuse.has(weighted)
        ? Promise.reject(new Error('bad font'))
        : Promise.resolve(this);
    }
  }
  vi.stubGlobal('FontFace', Face);
  const added = new Set<unknown>();
  const doc = {
    fonts: {
      add: (face: unknown) => added.add(face),
      delete: (face: unknown) => added.delete(face),
    },
  } as unknown as Document;
  return { doc, made, added };
}

const face = (family: string, bytes: Uint8Array<ArrayBuffer>): FontFaceFile => ({
  family,
  weight: 400,
  style: 'normal',
  bytes,
});

describe('registerFaces', () => {
  it('DOCE-PAGINATION-12.8 shares the faces of the same file handed in another buffer, and renames other files', () => {
    const { doc, made, added } = browserDocument();
    const first = registerFaces(doc, { faces: [face('Arial', new Uint8Array([1, 2, 3]))] });
    const copy = registerFaces(doc, { faces: [face('arial', new Uint8Array([1, 2, 3]))] });
    const other = registerFaces(doc, { faces: [face('Arial', new Uint8Array([1, 2, 4]))] });
    expect(copy.renamed).toBe(false);
    expect(copy.drawnFamily('Arial')).toBe('Arial');
    expect(other.renamed).toBe(true);
    expect(made).toEqual(['Arial', expect.stringMatching(/^Arial de-\d+$/u)]);
    first.release();
    copy.release();
    other.release();
    expect(added.size).toBe(0);
  });

  it('DOCE-PAGINATION-12.5 takes every face of a family out when the browser refuses one, and names it', async () => {
    const { doc, added } = browserDocument(new Set(['Broken 700']));
    const registration = registerFaces(doc, {
      faces: [
        face('Broken', new Uint8Array([5])),
        { ...face('Broken', new Uint8Array([7])), weight: 700 },
        face('Arial', new Uint8Array([6])),
      ],
    });
    expect(await registration.loaded).toEqual(new Set(['broken']));
    expect([...added].map((each) => (each as { family: string }).family)).toEqual(['Arial']);
    registration.release();
  });
});

class OrderedTestFace {
  constructor(
    readonly family: string,
    readonly bytes: FontFaceFile['bytes'],
  ) {}

  load() {
    return Promise.resolve(this);
  }
}

function orderedFontDocument() {
  vi.stubGlobal('FontFace', OrderedTestFace);
  const faces = new Set<OrderedTestFace>();
  return { doc: { fonts: faces } as unknown as Document, faces };
}

const orderedFace = (family: string, id: number): FontFaceFile => ({
  family,
  weight: 400,
  style: 'normal',
  unicodeRange: 'U+0-FF',
  bytes: new Uint8Array([id]),
});

describe('DOCE-PAGINATION-12.8 document font registrations', () => {
  it('shares identical orders and gives a reversed order its own family', () => {
    const { doc, faces } = orderedFontDocument();
    const first = orderedFace('Reading', 1);
    const last = orderedFace('Reading', 2);
    const original = registerFaces(doc, { faces: [first, last] });
    const shared = registerFaces(doc, { faces: [first, last, last] });
    const reversed = registerFaces(doc, { faces: [first, last, first] });
    const alias = reversed.drawnFamily('Reading');
    expect(shared.drawnFamily('Reading')).toBe('Reading');
    expect(alias).not.toBe('Reading');
    const files = (family: string) =>
      [...faces].filter((face) => face.family === family).map((face) => face.bytes);
    expect(files('Reading')).toEqual([first.bytes, last.bytes]);
    expect(files(alias)).toEqual([last.bytes, first.bytes]);
    original.release();
    expect(files('Reading')).toEqual([first.bytes, last.bytes]);
    reversed.release();
    shared.release();
    expect(faces.size).toBe(0);
  });

  it('keeps aliases distinct from literal families already held or arriving in the same batch', () => {
    const { doc, faces } = orderedFontDocument();
    const first = registerFaces(doc, {
      faces: [orderedFace('Reading', 1), orderedFace('Reading de-1', 2)],
    });
    const other = registerFaces(doc, {
      faces: [orderedFace('Reading', 3), orderedFace('Reading de-2', 4)],
    });
    expect(other.drawnFamily('Reading de-2')).toBe('Reading de-2');
    expect(other.drawnFamily('Reading')).not.toMatch(/^Reading(?: de-[12])?$/u);
    expect(new Set([...faces].map((face) => face.family)).size).toBe(4);
    first.release();
    other.release();
  });

  it('assigns a new name when the requested literal name is already drawn as an alias', () => {
    const { doc, faces } = orderedFontDocument();
    const first = registerFaces(doc, { faces: [orderedFace('Reading', 1)] });
    const other = registerFaces(doc, { faces: [orderedFace('Reading', 2)] });
    const alias = other.drawnFamily('Reading');
    const literal = registerFaces(doc, { faces: [orderedFace(alias, 3)] });
    expect(literal.drawnFamily(alias)).not.toBe(alias);
    expect(new Set([...faces].map((face) => face.family)).size).toBe(3);
    other.release();
    expect([...faces].map((face) => face.family)).toEqual(['Reading', literal.drawnFamily(alias)]);
    first.release();
    literal.release();
  });
});
