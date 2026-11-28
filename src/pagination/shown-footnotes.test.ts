import { describe, expect, it } from 'vitest';
import { createShownFootnotes } from './shown-footnotes.js';

describe('the footnotes earlier pages show', () => {
  it('DOCE-PAGINATION-5.5 names the same footnotes alike in any order, and others apart', () => {
    const shown = (ids: readonly string[]) => {
      const footnotes = createShownFootnotes();
      for (const id of ids) footnotes.add(id);
      return footnotes;
    };
    expect(shown([]).key).toBe('');
    expect(shown(['a', 'b', 'c']).key).toBe(shown(['c', 'a', 'b', 'a']).key);
    expect(shown(['a', 'b']).key).not.toBe(shown(['a', 'c']).key);
    expect(shown(['a', 'b']).key).not.toBe(shown(['a']).key);
    expect(shown(['a']).has('a')).toBe(true);
    expect(shown(['a']).has('b')).toBe(false);
  });

  it('DOCE-PAGINATION-5.5 names each of 10,000 sets of footnotes, grown one at a time, apart', () => {
    const footnotes = createShownFootnotes();
    const keys = new Set<string>();
    for (let index = 0; index < 10_000; index += 1) {
      footnotes.add(`f${String(index)}`);
      keys.add(footnotes.key);
    }
    expect(keys.size).toBe(10_000);
  });
});
