import { describe, expect, it } from 'vitest';
import {
  ABBREVIATION_CACHE_REFRESH_META,
  isGlossaryEntryId,
  normalizeGlossaryInput,
} from './glossary.js';

describe('glossary input', () => {
  it('DOCE-REFERENCES-2.4 tells a glossary entry id from any other text', () => {
    expect(isGlossaryEntryId('entry-42')).toBe(true);
    expect(isGlossaryEntryId('a'.repeat(64))).toBe(true);
    expect(isGlossaryEntryId('a'.repeat(65))).toBe(false);
    expect(isGlossaryEntryId('')).toBe(false);
    expect(isGlossaryEntryId('has space')).toBe(false);
  });

  it('DOCE-REFERENCES-2.4 trims an entry and refuses one out of bounds', () => {
    expect(
      normalizeGlossaryInput({ abbreviation: ' GSE ', expansion: ' Ground equipment ' }),
    ).toEqual({ abbreviation: 'GSE', expansion: 'Ground equipment' });
    expect(() => normalizeGlossaryInput({ abbreviation: '', expansion: 'Text' })).toThrow(Error);
    expect(() =>
      normalizeGlossaryInput({ abbreviation: 'A'.repeat(33), expansion: 'Text' }),
    ).toThrow(Error);
    expect(() => normalizeGlossaryInput({ abbreviation: 'A', expansion: 'x'.repeat(257) })).toThrow(
      Error,
    );
    expect(() => normalizeGlossaryInput({ abbreviation: 3, expansion: 'Text' })).toThrow(Error);
  });

  it('DOCE-REFERENCES-2.4 names the abbreviation refresh meta stably', () => {
    expect(ABBREVIATION_CACHE_REFRESH_META).toBe('doceditor-abbreviation-cache-refresh');
  });
});
