// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('DOCE-PAGINATION-12.5 asks again for a family whose files failed to arrive, after a wait that doubles', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const asked: string[][] = [];
    let failing = 2;
    const fonts: FontsAdapter = {
      load: () => Promise.resolve(ok([])),
      shaper: () => Promise.resolve(ok<FontShaper>(harfBuzzWasm())),
      files: (families) => {
        asked.push([...families]);
        if (families.includes('Lab Geist Mono') && failing > 0) {
          failing -= 1;
          return Promise.reject(new Error('offline'));
        }
        return Promise.resolve(ok(filesOf(families)));
      },
    };
    const served = await loadPagesFonts(fonts, ['Lab Geist'], { doc });
    if (served.phase !== 'pretext') throw new Error('not served');
    expect(await served.add(['Lab Geist Mono'])).toBe(false);
    // Not again at once: a second later, then two seconds after the next failure.
    expect(await served.add(['Lab Geist Mono'])).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(await served.add(['Lab Geist Mono'])).toBe(false);
    vi.advanceTimersByTime(1999);
    expect(await served.add(['Lab Geist Mono'])).toBe(false);
    vi.advanceTimersByTime(1);
    expect(await served.add(['Lab Geist Mono'])).toBe(true);
    expect(served.isFontServed('Lab Geist Mono')).toBe(true);
    expect(asked).toEqual([
      ['Lab Geist'],
      ['Lab Geist Mono'],
      ['Lab Geist Mono'],
      ['Lab Geist Mono'],
    ]);
    // A host that throws instead of rejecting is a failure too.
    const throwing: FontsAdapter = {
      ...fonts,
      files: (families) => {
        if (families.includes('Lab Geist Mono')) throw new Error('broken');
        return Promise.resolve(ok(filesOf(families)));
      },
    };
    const other = await loadPagesFonts(throwing, ['Lab Geist'], { doc });
    if (other.phase !== 'pretext') throw new Error('not served');
    expect(await other.add(['Lab Geist Mono'])).toBe(false);
    served.destroy();
    other.destroy();
  });

  it('DOCE-PAGINATION-12.5 does not serve a family the browser refuses a face of, nor a generic for it', async () => {
    const added = new Set<unknown>();
    const browserDoc = {
      fonts: {
        add: (face: unknown) => added.add(face),
        delete: (face: unknown) => added.delete(face),
      },
    } as unknown as Document;
    class RefusingFace {
      constructor(readonly family: string) {}
      load() {
        return this.family === 'Lab Geist Mono'
          ? Promise.reject(new Error('bad font'))
          : Promise.resolve(this);
      }
    }
    vi.stubGlobal('FontFace', RefusingFace);
    const fonts: FontsAdapter = {
      load: () => Promise.resolve(ok([])),
      shaper: () => Promise.resolve(ok<FontShaper>(harfBuzzWasm())),
      files: (families) => Promise.resolve(ok(filesOf(families))),
    };
    const served = await loadPagesFonts(fonts, ['Lab Geist', 'Lab Geist Mono'], {
      doc: browserDoc,
    });
    if (served.phase !== 'pretext') throw new Error('not served');
    expect(served.isFontServed('Lab Geist')).toBe(true);
    expect(served.isFontServed('Lab Geist Mono')).toBe(false);
    expect(served.generics).toEqual({});
    expect(served.files().faces.map((face) => face.family)).not.toContain('Lab Geist Mono');
    expect([...added].every((face) => (face as RefusingFace).family === 'Lab Geist')).toBe(true);
    served.destroy();
    expect(added.size).toBe(0);
  });

  it('DOCE-PAGINATION-12.8 keeps once a face handed again in a new buffer', async () => {
    const fonts: FontsAdapter = {
      load: () => Promise.resolve(ok([])),
      shaper: () => Promise.resolve(ok<FontShaper>(harfBuzzWasm())),
      // Each call copies the files, as a host reading them again would.
      files: () => {
        const files = filesOf(['Lab Geist']);
        return Promise.resolve(
          ok({
            ...files,
            faces: files.faces.map((face) => ({ ...face, bytes: face.bytes.slice() })),
          }),
        );
      },
    };
    const served = await loadPagesFonts(fonts, ['Lab Geist'], { doc });
    if (served.phase !== 'pretext') throw new Error('not served');
    const before = served.files().faces.length;
    expect(await served.add(['Lab Geist Copy'])).toBe(true);
    expect(served.files().faces).toHaveLength(before);
    served.destroy();
  });
});

afterEach(() => {
  vi.useRealTimers();
});
