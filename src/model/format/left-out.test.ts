// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { StoredNode } from './document-format.js';
import { isLeftOut } from './left-out.js';

const block = (suggestionKind?: string): StoredNode => ({
  type: 'figure',
  attrs: { src: 'a.png', ...(suggestionKind ? { suggestionKind, suggestionId: 's1' } : {}) },
});
const marked = (type: string): StoredNode => ({ type: 'text', text: 'a', marks: [{ type }] });

describe('isLeftOut', () => {
  it('DOCE-FORMAT-4.3 leaves out a block suggested for deletion when the suggestions are accepted', () => {
    expect(isLeftOut(block('deletion'), 'accepted')).toBe(true);
    expect(isLeftOut(block('insertion'), 'accepted')).toBe(false);
    expect(isLeftOut(block(), 'accepted')).toBe(false);
  });

  it('DOCE-FORMAT-4.3 leaves out a block suggested as an insertion when they are rejected', () => {
    expect(isLeftOut(block('insertion'), 'rejected')).toBe(true);
    expect(isLeftOut(block('deletion'), 'rejected')).toBe(false);
  });

  it('DOCE-FORMAT-4.3 leaves out text and inline nodes by their suggestion marks', () => {
    expect(isLeftOut(marked('deletion'), 'accepted')).toBe(true);
    expect(isLeftOut(marked('insertion'), 'rejected')).toBe(true);
    expect(isLeftOut(marked('insertion'), 'accepted')).toBe(false);
    expect(isLeftOut({ type: 'math', marks: [{ type: 'deletion' }] }, 'accepted')).toBe(true);
  });
});
