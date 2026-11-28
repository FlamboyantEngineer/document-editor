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
