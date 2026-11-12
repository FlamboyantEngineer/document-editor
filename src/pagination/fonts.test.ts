import { describe, expect, it, vi } from 'vitest';
import type { FontsAdapter } from '../host/index.js';
import type { TemplateFile } from '../model/index.js';
import { FONT_TIMEOUT, loadTemplateFonts, templateFontFamilies } from './fonts.js';

const template = {
  textStyles: {
    paragraph: { font: 'Sample Serif', fontSize: '11pt' },
    heading1: { font: ' Sample Sans ' },
    heading2: { font: 'Sample Serif' },
  },
  sections: [{ name: 'Annex', textStyles: { codeBlock: { font: 'Sample Mono' } } }],
} as unknown as TemplateFile;

describe('template fonts', () => {
  it('DOCE-PAGINATION-5.6 names each font family a template uses once', () => {
    expect(templateFontFamilies(template)).toEqual(['Sample Serif', 'Sample Sans', 'Sample Mono']);
    expect(templateFontFamilies({} as TemplateFile)).toEqual([]);
  });

  it('DOCE-PAGINATION-5.6 DOCE-HOST-1.12 asks the host to load them, within the timeout', async () => {
    const load = vi.fn<FontsAdapter['load']>(async (families) => ({ ok: true, value: families }));
    await loadTemplateFonts({ load }, template);
    expect(load).toHaveBeenCalledWith(['Sample Serif', 'Sample Sans', 'Sample Mono'], {
      timeout: FONT_TIMEOUT,
    });
    expect(loadTemplateFonts(undefined, template)).toBeUndefined();
    expect(loadTemplateFonts({ load }, {} as TemplateFile)).toBeUndefined();
  });
});
