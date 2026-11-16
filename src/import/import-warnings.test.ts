import { describe, expect, it } from 'vitest';
import { createImportWarnings, importWarningGroup } from './import-warnings.js';

describe('import warnings', () => {
  it('DOCE-IMPORT-1.2 gathers one warning per kind and detail, counting repeats in order', () => {
    const warnings = createImportWarnings();
    expect(warnings.list()).toEqual([]);
    warnings.add('style-left-out', 'Fancy');
    warnings.add('content-left-out');
    warnings.add('style-left-out', 'Fancy');
    warnings.add('style-left-out', 'Plain');
    expect(warnings.list()).toEqual([
      { code: 'style-left-out', detail: 'Fancy', count: 2, group: 'not-imported' },
      { code: 'content-left-out', detail: '', count: 1, group: 'not-imported' },
      { code: 'style-left-out', detail: 'Plain', count: 1, group: 'not-imported' },
    ]);
  });

  it('DOCE-IMPORT-1.3 puts each kind in one report group, unknown kinds as not imported', () => {
    expect(importWarningGroup('heading-number-removed')).toBe('not-imported');
    expect(importWarningGroup('caption-left-out')).toBe('not-imported');
    expect(importWarningGroup('review-left-out')).toBe('not-imported');
    expect(importWarningGroup('caption-numbered')).toBe('applied');
    expect(importWarningGroup('title-applied')).toBe('applied');
    expect(importWarningGroup('heading-numbering-applied')).toBe('applied');
    expect(importWarningGroup('table-style-applied')).toBe('applied');
    expect(importWarningGroup('contents-skipped')).toBe('skipped');
    expect(importWarningGroup('header-footer-skipped')).toBe('skipped');
    expect(importWarningGroup('section-layout-skipped')).toBe('skipped');
    expect(importWarningGroup('formatting-left-out')).toBe('skipped');
    expect(importWarningGroup('a-host-code')).toBe('not-imported');
  });
});
