// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createImportWarnings } from '../import-warnings.js';
import type { ZipArchive } from '../zip-read.js';
import { openPackage } from './docx-package.js';

describe('the parts of a package', () => {
  it('DOCE-IMPORT-2.1 reads each part once, however often it is asked for', async () => {
    const files: Readonly<Record<string, string>> = {
      'word/header1.xml': '<w:hdr><w:p/></w:hdr>',
    };
    const reads: string[] = [];
    const archive: ZipArchive = {
      paths: Object.keys(files),
      read: (path) => {
        reads.push(path);
        const text = files[path];
        return Promise.resolve(text === undefined ? null : new TextEncoder().encode(text));
      },
    };
    const pkg = openPackage(archive, createImportWarnings());
    const [first, second] = await Promise.all([
      pkg.part('word/header1.xml'),
      pkg.part('word/header1.xml'),
    ]);
    expect(await pkg.part('word/header1.xml')).toBe(first);
    expect(second).toBe(first);
    expect(reads).toEqual(['word/header1.xml', 'word/_rels/header1.xml.rels']);
  });
});
