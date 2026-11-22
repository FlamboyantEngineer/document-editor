// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { FontFaceFile } from '../../host/font-files.js';
import { readHostFaces } from './host-faces.js';

const signed = (signature: number) => {
  const bytes = new Uint8Array(16);
  new DataView(bytes.buffer).setUint32(0, signature);
  return bytes;
};
const woff = signed(0x774f4646);
const face = (overrides: Partial<FontFaceFile>): FontFaceFile => ({
  family: 'Sans',
  weight: 400,
  style: 'normal',
  bytes: woff,
  ...overrides,
});

describe('DOCE-HOST-1.14.2 served faces are checked', () => {
  it('keeps WOFF and OpenType faces, with their style, weight and unicode-range', () => {
    const { faces, problems } = readHostFaces({
      faces: [
        face({ style: 'italic', weight: 700, unicodeRange: 'U+0000-00FF' }),
        face({ bytes: signed(0x00010000).buffer }),
        face({ bytes: signed(0x4f54544f) }),
      ],
    });
    expect(problems).toEqual([]);
    expect(faces.map(({ italic, weight, unicodeRange }) => [italic, weight, unicodeRange])).toEqual(
      [
        [true, 700, 'U+0000-00FF'],
        [false, 400, undefined],
        [false, 400, undefined],
      ],
    );
  });

  it('leaves out, without throwing, faces it cannot read, each with a problem', () => {
    const { faces, problems } = readHostFaces({
      faces: [
        face({ bytes: new Uint8Array() }),
        face({ style: 'oblique' as FontFaceFile['style'] }),
        face({ weight: 1200 }),
        face({ bytes: signed(0x774f4632) }),
        face({ bytes: undefined as unknown as Uint8Array<ArrayBuffer> }),
        face({}),
      ],
    });
    expect(faces).toHaveLength(1);
    expect(problems.map(({ kind, index }) => [kind, index])).toEqual([
      ['empty', 0],
      ['style', 1],
      ['weight', 2],
      ['format', 3],
      ['empty', 4],
    ]);
  });
});
