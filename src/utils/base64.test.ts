// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { encodeBase64 } from './base64.js';

describe('encodeBase64', () => {
  it('DOCE-PAGINATION-13.8 DOCE-IMPORT-2.8 encodes bytes larger than one chunk as one base64 text', () => {
    const bytes = Uint8Array.from({ length: 0x8000 * 3 + 5 }, (_, index) => (index * 31) % 256);
    expect(encodeBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    expect(encodeBase64(new Uint8Array())).toBe('');
  });
});
