import { describe, expect, it } from 'vitest';
import { codeLanguageOfUrl } from './linked-code.js';

describe('linked code', () => {
  it("DOCE-OBJECTS-1.2 reads a language from the URL's file extension", () => {
    expect(codeLanguageOfUrl('https://example.com/src/clock.ts#L2-L3')).toBe('typescript');
    expect(codeLanguageOfUrl('https://example.com/a/Main.JAVA')).toBe('java');
    expect(codeLanguageOfUrl('https://example.com/run.py?raw=1')).toBe('python');
    expect(codeLanguageOfUrl('https://example.com/lib/table.hpp')).toBe('cpp');
    expect(codeLanguageOfUrl('https://example.com/README')).toBeNull();
    expect(codeLanguageOfUrl('https://example.com/.env')).toBeNull();
    expect(codeLanguageOfUrl('https://example.com/notes.txt')).toBeNull();
  });
});
