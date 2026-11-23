// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fontFaceRules } from './font-faces.js';

const woff = new Uint8Array([0x77, 0x4f, 0x46, 0x46, 1, 2, 3]);

describe('fontFaceRules', () => {
  it('DOCE-PAGINATION-13.8 holds each served face inline under its family, weight and style', () => {
    const rules = fontFaceRules({
      faces: [
        { family: 'Times "New" Roman', weight: 700, style: 'italic', bytes: woff },
        { family: 'Arial', weight: 400, style: 'normal', unicodeRange: 'U+0-FF', bytes: woff },
      ],
    });
    expect(rules).toBe(
      [
        `@font-face { font-family: "Times \\"New\\" Roman"; src: url(data:font/woff;base64,${btoa('wOFF\x01\x02\x03')}); font-weight: 700; font-style: italic; font-display: block; }`,
        `@font-face { font-family: "Arial"; src: url(data:font/woff;base64,${btoa('wOFF\x01\x02\x03')}); font-weight: 400; font-style: normal; unicode-range: U+0-FF; font-display: block; }`,
      ].join(' '),
    );
  });

  it('DOCE-PAGINATION-13.8 names an OpenType or TrueType file by its signature, and gives none without fonts', () => {
    const otf = new Uint8Array([0x4f, 0x54, 0x54, 0x4f]).buffer;
    const ttf = new Uint8Array([0, 1, 0, 0]).buffer;
    const face = { family: 'A', weight: 400, style: 'normal' } as const;
    expect(fontFaceRules({ faces: [{ ...face, bytes: otf }] })).toContain('data:font/otf;');
    expect(fontFaceRules({ faces: [{ ...face, bytes: ttf }] })).toContain('data:font/ttf;');
    expect(fontFaceRules(null)).toBe('');
  });
});
