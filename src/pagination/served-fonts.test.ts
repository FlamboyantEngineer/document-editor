// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deferred } from '../../test/deferred.js';
import { harfBuzzWasm, referenceFaces } from '../../test/font-files-node.js';
import { registerFaces } from '../document/font-registry.js';
import type { FontsAdapter, HostResult } from '../host/adapters.js';
import type { FontFaceFile, FontFiles, FontShaper } from '../host/font-files.js';
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

function fontDocument(
  waitFor?: (family: string, descriptors: FontFaceDescriptors) => Promise<void>,
) {
  class TestFace {
    constructor(
      readonly family: string,
      readonly bytes: FontFaceFile['bytes'],
      readonly descriptors: FontFaceDescriptors,
    ) {}

    async load() {
      await waitFor?.(this.family, this.descriptors);
      return this;
    }
  }
  vi.stubGlobal('FontFace', TestFace);
  const faces = new Set<TestFace>();
  return { doc: { fonts: faces } as unknown as Document, faces };
}

const fontAdapter = (files: NonNullable<FontsAdapter['files']>): FontsAdapter => ({
  files,
  load: () => Promise.resolve(ok([])),
  shaper: () => Promise.resolve(ok(harfBuzzWasm())),
});

afterEach(() => vi.unstubAllGlobals());

describe('loadPagesFonts', () => {
  it('DOCE-PAGINATION-12.8 draws the whole augmented family and releases the old registration after adoption', async () => {
    const { doc, faces } = fontDocument();
    const reference = filesOf(['Lab Geist']).faces;
    const regular = reference.find(({ weight }) => weight === 400);
    const bold = reference.find(({ weight }) => weight === 700);
    if (!regular || !bold) throw new Error('Expected regular and bold files');
    const viewer = registerFaces(doc, { faces: [regular] });
    const fonts = fontAdapter((families) =>
      Promise.resolve(ok({ faces: families.includes('Later') ? [regular, bold] : [regular] })),
    );
    const served = await loadPagesFonts(fonts, ['Lab Geist'], { doc });
    if (served.phase !== 'pretext') throw new Error('Expected usable fonts');
    const before = served.drawing();
    const measure = served.measureContext();
    measure.font = '16px "Lab Geist"';
    const regularWidth = measure.measureText('Web typography').width;
    expect([...faces].map(({ family }) => family)).toEqual(['Lab Geist']);

    expect(await served.add(['Later'])).toBe(true);
    const after = served.drawing();
    const alias = after.drawnFamily('Lab Geist');
    expect(alias).not.toBe('Lab Geist');
    expect(served.isFontServed(alias)).toBe(true);
    const aliased = [...faces].filter(({ family }) => family === alias);
    expect(aliased.map(({ bytes }) => bytes)).toEqual([regular.bytes, bold.bytes]);
    measure.font = `16px "${alias}"`;
    expect(measure.measureText('Web typography').width).toBe(regularWidth);
    expect(before.drawnFiles().faces).toEqual([regular]);
    expect(after.drawnFiles().faces.filter(({ family }) => family === alias)).toHaveLength(2);
    expect(faces.size).toBe(3);

    after.adopt();
    expect(faces.size).toBe(3);
    viewer.release();
    expect([...faces]).toEqual(aliased);
    served.destroy();
    expect(faces.size).toBe(0);
  });

  it('DOCE-PAGINATION-12.8 exposes only ready face batches in a drawing', async () => {
    const started = deferred<void>();
    const pending = deferred<void>();
    const { doc } = fontDocument((family) => {
      if (family !== 'Pending') return Promise.resolve();
      started.resolve();
      return pending.promise;
    });
    const [reference] = filesOf(['Lab Geist']).faces;
    if (!reference) throw new Error('Expected a reference face');
    const fonts = fontAdapter((families) =>
      Promise.resolve(ok({ faces: families.map((family) => ({ ...reference, family })) })),
    );
    const served = await loadPagesFonts(fonts, ['Initial'], { doc });
    if (served.phase !== 'pretext') throw new Error('Expected usable fonts');
    const first = served.add(['Ready']);
    const second = served.add(['Pending']);
    await started.promise;
    expect(await first).toBe(true);
    expect(served.drawing().files.faces.map(({ family }) => family)).toEqual(['Initial', 'Ready']);
    pending.resolve();
    expect(await second).toBe(true);
    expect(served.drawing().files.faces.map(({ family }) => family)).toEqual([
      'Initial',
      'Ready',
      'Pending',
    ]);
    served.destroy();
  });

  it('DOCE-PAGINATION-12.8 keeps snapshot rules distinct when a later family is named like an alias', async () => {
    const { doc } = fontDocument();
    const faces = filesOf(['Lab Geist', 'Lab Geist Mono']).faces;
    const regular = faces.find(({ family }) => family === 'Lab Geist');
    const mono = faces.find(({ family }) => family === 'Lab Geist Mono');
    if (!regular || !mono) throw new Error('Expected reference faces');
    const viewer = registerFaces(doc, { faces: [{ ...mono, family: regular.family }] });
    let literal = '';
    const fonts = fontAdapter((families) =>
      Promise.resolve(
        ok({ faces: families.includes(literal) ? [{ ...mono, family: literal }] : [regular] }),
      ),
    );
    const served = await loadPagesFonts(fonts, [regular.family], { doc });
    if (served.phase !== 'pretext') throw new Error('Expected usable fonts');
    literal = served.drawing().drawnFamily(regular.family);
    expect(await served.add([literal])).toBe(true);
    const drawing = served.drawing();
    const alias = drawing.drawnFamily(literal);
    expect(alias).not.toBe(literal);
    expect(drawing.files.faces).toEqual([regular, { ...mono, family: literal }]);
    expect(drawing.drawnFiles().faces).toEqual([
      regular,
      { ...regular, family: literal },
      { ...mono, family: alias },
    ]);
    viewer.release();
    served.destroy();
  });

  it('DOCE-PAGINATION-12.5 measures and draws generic families with the same first valid mapping', async () => {
    const faces = filesOf(['Lab Geist', 'Lab Geist Mono']).faces;
    const files = fontAdapter((families) =>
      Promise.resolve(
        ok<FontFiles>(
          families.includes('Later')
            ? { faces: [], generics: { serif: 'Lab Geist', 'sans-serif': 'Lab Geist Mono' } }
            : { faces, generics: { serif: 'Missing', 'sans-serif': 'Lab Geist' } },
        ),
      ),
    );
    const served = await loadPagesFonts(files, ['Lab Geist'], { doc });
    if (served.phase !== 'pretext') throw new Error('Expected usable fonts');
    const measure = served.measureContext();
    const width = (stack: string) => {
      measure.font = `16px ${stack}`;
      return measure.measureText('Web typography').width;
    };
    expect(served.files().generics).toEqual({ 'sans-serif': 'Lab Geist' });
    expect(width('serif, "Lab Geist Mono"')).toBe(width('"Lab Geist Mono"'));
    expect(await served.add(['Later'])).toBe(true);
    expect(served.files().generics).toEqual({ serif: 'Lab Geist', 'sans-serif': 'Lab Geist' });
    expect(width('serif')).toBe(width('"Lab Geist"'));
    expect(width('sans-serif')).toBe(width('"Lab Geist"'));
    expect(width('sans-serif')).not.toBe(width('"Lab Geist Mono"'));
    served.destroy();
  });

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

  it('DOCE-HOST-1.14.1 reports synchronous host failures as unavailable fonts', async () => {
    const fonts: FontsAdapter = {
      load: () => Promise.resolve(ok([])),
      shaper: () => Promise.resolve(ok(harfBuzzWasm())),
      files: (families) => Promise.resolve(ok(filesOf(families))),
    };
    const fail = () => {
      throw new Error('Font service unavailable');
    };
    await expect(
      loadPagesFonts({ ...fonts, shaper: fail }, ['Lab Geist'], { doc }),
    ).resolves.toEqual({
      phase: 'browser',
      reason: 'shaper-failed',
    });
    await expect(
      loadPagesFonts({ ...fonts, files: fail }, ['Lab Geist'], { doc }),
    ).resolves.toEqual({
      phase: 'browser',
      reason: 'files-failed',
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

  it('DOCE-PAGINATION-12.5 retries the omitted family of a partial batch without asking again for its siblings', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const [reference] = filesOf(['Lab Geist']).faces;
    if (!reference) throw new Error('Expected a reference face');
    const files = vi.fn<NonNullable<FontsAdapter['files']>>();
    files
      .mockResolvedValueOnce(ok({ faces: [reference] }))
      .mockResolvedValueOnce(ok({ faces: [{ ...reference, family: 'Sibling' }] }))
      .mockResolvedValueOnce(ok({ faces: [{ ...reference, family: 'Later' }] }));
    const served = await loadPagesFonts(fontAdapter(files), ['Lab Geist', 'Later'], { doc });
    if (served.phase !== 'pretext') throw new Error('Expected usable fonts');

    expect(await served.add(['later'])).toBe(false);
    expect(files).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(await served.add(['Lab Geist', 'Later', 'Sibling'])).toBe(true);
    expect(served.isFontServed('Sibling')).toBe(true);
    expect(served.isFontServed('Later')).toBe(false);
    vi.advanceTimersByTime(1999);
    expect(await served.add(['Later', 'Sibling'])).toBe(false);
    expect(files).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(await served.add(['"later"', 'Sibling'])).toBe(true);
    expect(served.isFontServed('Later')).toBe(true);
    expect(files.mock.calls.map(([families]) => families)).toEqual([
      ['Lab Geist', 'Later'],
      ['Later', 'Sibling'],
      ['"later"'],
    ]);
    served.destroy();
  });

  it('DOCE-PAGINATION-12.5 considers a generic delivered when a face-less batch maps it to an existing family', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const files = vi.fn<NonNullable<FontsAdapter['files']>>();
    files
      .mockResolvedValueOnce(ok(filesOf(['Lab Geist'])))
      .mockResolvedValueOnce(ok({ faces: [], generics: { serif: 'Lab Geist' } }));
    const served = await loadPagesFonts(fontAdapter(files), ['Lab Geist', 'serif'], { doc });
    if (served.phase !== 'pretext') throw new Error('Expected usable fonts');

    vi.advanceTimersByTime(1000);
    expect(await served.add(['serif'])).toBe(true);
    expect(served.generics.serif).toBe('Lab Geist');
    vi.advanceTimersByTime(2000);
    expect(await served.add(['serif'])).toBe(false);
    expect(files.mock.calls.map(([families]) => families)).toEqual([
      ['Lab Geist', 'serif'],
      ['serif'],
    ]);
    served.destroy();
  });

  it('DOCE-PAGINATION-12.5 does not serve a family the browser refuses a face of, nor a generic for it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
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
    const files = vi.spyOn(fonts, 'files');
    const served = await loadPagesFonts(fonts, ['Lab Geist', 'Lab Geist Mono'], {
      doc: browserDoc,
    });
    if (served.phase !== 'pretext') throw new Error('not served');
    expect(served.isFontServed('Lab Geist')).toBe(true);
    expect(served.isFontServed('Lab Geist Mono')).toBe(false);
    expect(served.generics).toEqual({});
    expect(served.files().faces.map((face) => face.family)).not.toContain('Lab Geist Mono');
    expect([...added].every((face) => (face as RefusingFace).family === 'Lab Geist')).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(await served.add(['Lab Geist Mono'])).toBe(false);
    expect(files).toHaveBeenCalledTimes(1);
    const context = served.measureContext();
    context.font = '16px "Lab Geist"';
    const regularWidth = context.measureText('Web typography').width;
    for (const font of ['"Lab Geist Mono"', 'monospace', '"Lab Geist Mono", "Lab Geist"']) {
      context.font = `16px ${font}`;
      expect(context.measureText('Web typography').width).toBe(regularWidth);
    }
    served.destroy();
    expect(added.size).toBe(0);
  });

  it('DOCE-PAGINATION-12.5 DOCE-PAGINATION-12.8 retains the measured and drawn family if its upgrade fails', async () => {
    const started = deferred<void>();
    const pending = deferred<void>();
    const { doc, faces } = fontDocument((_family, { weight }) => {
      if (weight !== '700') return Promise.resolve();
      started.resolve();
      return pending.promise.then(() => {
        throw new Error('The browser refused the upgrade');
      });
    });
    const reference = filesOf(['Lab Geist', 'Lab Geist Mono']).faces;
    const regular = reference.find(
      ({ family, weight }) => family === 'Lab Geist' && weight === 400,
    );
    const mono = reference.find(
      ({ family, weight }) => family === 'Lab Geist Mono' && weight === 400,
    );
    if (!regular || !mono) throw new Error('Expected reference faces');
    const changed = { ...mono, family: regular.family, weight: 700 };
    const fonts = fontAdapter((families) =>
      Promise.resolve(ok({ faces: families.includes(mono.family) ? [changed, mono] : [regular] })),
    );
    const served = await loadPagesFonts(fonts, [regular.family], { doc });
    if (served.phase !== 'pretext') throw new Error('Expected usable fonts');
    const context = served.measureContext();
    context.font = `700 16px "${regular.family}"`;
    const width = () => context.measureText('WWWW').width;
    const before = width();
    const adding = served.add([mono.family]);
    await started.promise;
    expect(width()).toBe(before);
    pending.resolve();
    expect(await adding).toBe(true);

    expect(served.drawing().drawnFamily(regular.family)).toBe(regular.family);
    expect(served.files().faces).toEqual([regular, mono]);
    expect([...faces].map(({ family }) => family)).toEqual([regular.family, mono.family]);
    expect(width()).toBe(before);
    context.font = `16px "${mono.family}"`;
    expect(width()).not.toBe(before);
    served.destroy();
  });

  it('DOCE-PAGINATION-12.5 uses the web layout when no family passes browser acceptance', async () => {
    const { doc, faces } = fontDocument(() => Promise.reject(new Error('Cannot load face')));
    const fonts = fontAdapter((families) => Promise.resolve(ok(filesOf(families))));
    await expect(loadPagesFonts(fonts, ['Lab Geist'], { doc })).resolves.toEqual({
      phase: 'browser',
      reason: 'no-faces',
    });
    expect(faces.size).toBe(0);
  });

  it.each(['abort', 'destroy'])(
    'DOCE-PAGINATION-12.7 stops awaiting a pending shared browser registration on %s',
    async (cancel) => {
      const started = deferred<void>();
      const pending = deferred<void>();
      const controller = new AbortController();
      const { doc, faces } = fontDocument((family) => {
        if (family !== 'Pending') return Promise.resolve();
        started.resolve();
        return pending.promise;
      });
      const [reference] = filesOf(['Lab Geist']).faces;
      if (!reference) throw new Error('Expected a reference face');
      const fonts = fontAdapter((families) =>
        Promise.resolve(ok({ faces: families.map((family) => ({ ...reference, family })) })),
      );
      const abandoned = await loadPagesFonts(fonts, ['Previous'], {
        doc,
        signal: controller.signal,
      });
      if (abandoned.phase !== 'pretext') throw new Error('Expected usable fonts');
      const adding = abandoned.add(['Pending']);
      await started.promise;
      const shared = registerFaces(doc, { faces: [{ ...reference, family: 'Pending' }] });
      if (cancel === 'abort') controller.abort();
      else abandoned.destroy();
      expect([...faces].map(({ family }) => family)).toEqual(['Pending']);
      await expect(adding).resolves.toBe(false);
      await expect(Promise.race([shared.loaded, Promise.resolve('loading')])).resolves.toBe(
        'loading',
      );

      const next = await loadPagesFonts({ ...fonts }, ['Current'], { doc });
      if (next.phase !== 'pretext') throw new Error('Expected usable fonts');
      pending.resolve();
      await expect(shared.loaded).resolves.toEqual(new Set());
      shared.release();
      expect(abandoned.isFontServed('Pending')).toBe(false);
      expect([...faces].map(({ family }) => family)).toEqual(['Current']);
      next.destroy();
    },
  );

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
    expect(await served.add(['Lab Geist Copy'])).toBe(false);
    expect(served.files().faces).toHaveLength(before);
    served.destroy();
  });

  it('DOCE-HOST-1.14.1 shares pending batches across overlapping family requests', async () => {
    const asked: string[][] = [];
    const pending = deferred<HostResult<FontFiles>>();
    const fonts: FontsAdapter = {
      load: () => Promise.resolve(ok([])),
      shaper: () => Promise.resolve(ok(harfBuzzWasm())),
      files: (families) => {
        asked.push([...families]);
        if (families.includes('Lab Geist Mono')) return pending.promise;
        return Promise.resolve(ok(filesOf(families)));
      },
    };
    const served = await loadPagesFonts(fonts, ['Lab Geist', '"lab geist"'], { doc });
    if (served.phase !== 'pretext') throw new Error('not served');
    const first = served.add(['Lab Geist Mono', '"LAB GEIST MONO"']);
    const overlap = served.add(['Unserved', 'lab geist mono']);
    const joined = served.add(['"lab geist mono"']);
    const unserved = served.add(['unserved']);
    await expect(unserved).resolves.toBe(false);
    expect(await Promise.race([joined, Promise.resolve('pending')])).toBe('pending');
    pending.resolve(ok(filesOf(['Lab Geist Mono'])));
    await expect(Promise.all([first, overlap, joined])).resolves.toEqual([true, true, true]);
    await expect(served.add(['"lab geist mono"', 'Unserved'])).resolves.toBe(false);
    expect(asked).toEqual([['Lab Geist'], ['Lab Geist Mono'], ['Unserved']]);
    served.destroy();
  });

  it('DOCE-HOST-1.14.1 DOCE-PAGINATION-12.7 leaves failed or abandoned incremental loads unserved', async () => {
    const pending = deferred<HostResult<FontFiles>>();
    const controller = new AbortController();
    const fonts: FontsAdapter = {
      load: () => Promise.resolve(ok([])),
      shaper: () => Promise.resolve(ok(harfBuzzWasm())),
      files: (families, { signal }) => {
        expect(signal).toBe(controller.signal);
        if (families.includes('Lab Geist Mono')) return pending.promise;
        if (families.includes('Unserved')) throw new Error('Font service unavailable');
        return Promise.resolve(ok(filesOf(families)));
      },
    };
    const served = await loadPagesFonts(fonts, ['Lab Geist'], { doc, signal: controller.signal });
    if (served.phase !== 'pretext') throw new Error('not served');
    await expect(served.add(['Unserved'])).resolves.toBe(false);
    const added = served.add(['Lab Geist Mono']);
    await Promise.resolve();
    controller.abort();
    pending.resolve(ok(filesOf(['Lab Geist Mono'])));
    await expect(added).resolves.toBe(false);
    expect(served.isFontServed('Lab Geist Mono')).toBe(false);
    served.destroy();
  });
});

afterEach(() => vi.useRealTimers());
