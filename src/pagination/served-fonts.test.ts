// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { harfBuzzWasm, referenceFaces } from '../../test/font-files-node.js';
import type { FontsAdapter, HostResult } from '../host/adapters.js';
import type { FontFiles, FontShaper } from '../host/font-files.js';
import { loadPagesFonts } from './served-fonts.js';

const ok = <T>(value: T): HostResult<T> => ({ ok: true, value });

// The reference faces of the families asked for, with the generic keyword for the mono family.
const filesOf = (families: readonly string[]): FontFiles => ({
  faces: referenceFaces()
    .filter((face) => families.includes(face.family))
    .map(({ italic, ...face }) => ({ ...face, style: italic ? 'italic' : 'normal' })),
  generics: { monospace: 'Lab Geist Mono' },
});

const doc = {} as Document;

describe('loadPagesFonts', () => {
  it('DOCE-HOST-1.14.1 DOCE-PAGINATION-12.5 keeps the browser layout, saying why, without a shaper or files', async () => {
    expect(await loadPagesFonts(undefined, ['Lab Geist'], { doc })).toEqual({
      phase: 'browser',
      reason: 'no-shaper',
    });
    const noFiles: FontsAdapter = {
      load: () => Promise.resolve(ok([])),
      shaper: () => Promise.resolve(ok<FontShaper>(harfBuzzWasm())),
    };
    expect(await loadPagesFonts(noFiles, ['Lab Geist'], { doc })).toEqual({
      phase: 'browser',
      reason: 'no-files',
    });
  });

  it('DOCE-HOST-1.14.2 keeps usable faces during initial and incremental loads', async () => {
    const bytes = new Uint8Array(44);
    new DataView(bytes.buffer).setUint32(0, 0x774f4646);
    const files = (families: readonly string[]) =>
      ok<FontFiles>({
        ...filesOf(families),
        faces: [
          { bytes, family: 'Damaged', style: 'normal', weight: 400 },
          ...filesOf(families).faces,
        ],
      });
    const fonts: FontsAdapter = {
      load: () => Promise.resolve(ok([])),
      shaper: () => Promise.resolve(ok<FontShaper>(harfBuzzWasm())),
      files: (families) => Promise.resolve(files(families)),
    };
    const served = await loadPagesFonts(fonts, ['Lab Geist'], { doc });
    if (served.phase !== 'pretext') throw new Error('expected usable fonts');
    expect(served.isFontServed('Lab Geist')).toBe(true);
    expect(await served.add(['Lab Geist Mono'])).toBe(true);
    expect(served.isFontServed('Lab Geist Mono')).toBe(true);
    expect(served.isFontServed('Damaged')).toBe(false);
    expect(served.files().faces.every((face) => face.family !== 'Damaged')).toBe(true);
    served.destroy();
  });

  it('DOCE-HOST-1.14.1 DOCE-PAGINATION-12.5 measures with the served faces and asks only for families not asked yet', async () => {
    const asked: string[][] = [];
    const fonts: FontsAdapter = {
      load: () => Promise.resolve(ok([])),
      shaper: () => Promise.resolve(ok<FontShaper>(harfBuzzWasm())),
      files: (families) => {
        asked.push([...families]);
        return Promise.resolve(ok(filesOf(families)));
      },
    };
    const served = await loadPagesFonts(fonts, ['Lab Geist'], { doc });
    if (served.phase !== 'pretext') throw new Error('not served');
    expect(served.isFontServed('Lab Geist')).toBe(true);
    expect(served.isFontServed('"lab geist"')).toBe(true);
    expect(served.isFontServed('Lab Geist Mono')).toBe(false);
    const context = served.measureContext();
    context.font = '16px "Lab Geist"';
    expect(context.measureText('Pages').width).toBeGreaterThan(0);
    expect(await served.add(['Lab Geist', 'Lab Geist Mono'])).toBe(true);
    expect(await served.add(['Lab Geist Mono'])).toBe(false);
    expect(asked).toEqual([['Lab Geist'], ['Lab Geist Mono']]);
    expect(served.isFontServed('Lab Geist Mono')).toBe(true);
    expect(served.isFontServed('monospace')).toBe(false);
    expect(served.generics).toEqual({ monospace: 'Lab Geist Mono' });
    // DOCE-PAGINATION-13.8: the faces the pages measure and draw with, for their static drawings.
    const files = served.files();
    expect(new Set(files.faces.map((face) => face.family))).toEqual(
      new Set(['Lab Geist', 'Lab Geist Mono']),
    );
    expect(files.generics).toEqual({ monospace: 'Lab Geist Mono' });
    served.destroy();
  });
});
