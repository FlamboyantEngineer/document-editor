// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { harfBuzzWasm, referenceFaces } from '../../../test/font-files-node.js';
import { createHarfBuzz, heapResizer } from './harfbuzz.js';
import { readWoff } from './woff.js';

async function labGeist() {
  const harfBuzz = await createHarfBuzz(harfBuzzWasm());
  const [file] = referenceFaces();
  if (!file) throw new Error('no reference face');
  return harfBuzz.createFace(await readWoff(file.bytes as Uint8Array<ArrayBuffer>));
}

describe('HarfBuzz', () => {
  it('DOCE-PAGINATION-12.1 shapes with every feature it is given, past sixteen', async () => {
    const face = await labGeist();
    const kerned = face.shape('AV', { features: [], language: null }).advances[0];
    const unkerned = face.shape('AV', { features: ['-kern'], language: null }).advances[0];
    expect(kerned).not.toBe(unkerned);
    // Sixteen settings that keep kerning, then one that turns it off: the last one counts.
    const many = [...Array.from({ length: 16 }, () => '+kern'), '-kern'];
    expect(face.shape('AV', { features: many, language: null }).advances[0]).toBe(unkerned);
    // A shorter list after a longer one is read as written.
    expect(face.shape('AV', { features: ['+kern'], language: null }).advances[0]).toBe(kerned);
  });

  it('DOCE-PAGINATION-12.1 answers a heap that cannot grow with a failed allocation, not a throw', () => {
    const memory = new WebAssembly.Memory({ initial: 1, maximum: 2 });
    const resize = heapResizer({ memory });
    expect(resize(2 * 65_536)).toBe(1);
    expect(memory.buffer.byteLength).toBe(2 * 65_536);
    expect(resize(3 * 65_536)).toBe(0);
    expect(heapResizer({})(65_536)).toBe(0);
  });
});
