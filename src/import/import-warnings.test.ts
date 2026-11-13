import { describe, expect, it } from 'vitest';
import { createImportWarnings } from './import-warnings.js';

describe('import warnings', () => {
  it('DOCE-IMPORT-1.2 gathers one warning per kind and detail, counting repeats in order', () => {
    const warnings = createImportWarnings();
    expect(warnings.list()).toEqual([]);
    warnings.add('style-left-out', 'Fancy');
    warnings.add('content-left-out');
    warnings.add('style-left-out', 'Fancy');
    warnings.add('style-left-out', 'Plain');
    expect(warnings.list()).toEqual([
      { code: 'style-left-out', detail: 'Fancy', count: 2 },
      { code: 'content-left-out', detail: '', count: 1 },
      { code: 'style-left-out', detail: 'Plain', count: 1 },
    ]);
  });
});
