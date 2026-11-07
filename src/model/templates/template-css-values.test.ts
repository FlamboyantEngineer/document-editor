import { describe, expect, it } from 'vitest';
import {
  formatNumericMarginToCssPx,
  MM_TO_CSS_PX,
  PAGE_SIZE_DIMENSIONS,
  parseMarginToCssPx,
  resolveTemplateFontFamilyCssText,
  resolveTemplateMarginUnit,
  resolveTemplateStyleLineHeight,
  toTemplateCssSizeValue,
  toTemplateCssTextValue,
  toTemplateDisplayText,
} from '../index.js';

describe('template CSS values', () => {
  it('DOCE-TEMPLATES-1.1 sizes pages and reads margins in their units', () => {
    expect(PAGE_SIZE_DIMENSIONS.A4).toEqual({ width: '210mm', height: '297mm' });
    expect(PAGE_SIZE_DIMENSIONS['US Letter']).toEqual({ width: '8.5in', height: '11in' });
    expect(resolveTemplateMarginUnit(' a4 ')).toBe('mm');
    expect(resolveTemplateMarginUnit('US Letter')).toBe('in');
    expect(parseMarginToCssPx(1, 'in')).toBe('96px');
    expect(parseMarginToCssPx(10)).toBe(formatNumericMarginToCssPx(10, 'mm'));
    expect(parseMarginToCssPx('10mm')).toBe(`${String(10 * MM_TO_CSS_PX)}px`);
    expect(parseMarginToCssPx('72pt')).toBe('96px');
    expect(parseMarginToCssPx('0.5in')).toBe('48px');
    expect(parseMarginToCssPx('12')).toBe('12px');
    expect(parseMarginToCssPx('-3px')).toBe('0px');
    expect(parseMarginToCssPx('wide')).toBeNull();
    expect(parseMarginToCssPx(null)).toBeNull();
  });

  it('DOCE-TEMPLATES-1.2 writes sizes and texts with their fallbacks', () => {
    expect(toTemplateCssSizeValue(12)).toBe('12px');
    expect(toTemplateCssSizeValue(' 1.5em ')).toBe('1.5em');
    expect(toTemplateCssSizeValue('50%')).toBe('50%');
    expect(toTemplateCssSizeValue('', '6pt')).toBe('6pt');
    expect(toTemplateCssTextValue('  bold ')).toBe('bold');
    expect(toTemplateCssTextValue(undefined, 'normal')).toBe('normal');
    expect(toTemplateCssTextValue(' ', 'normal')).toBe('normal');
    expect(toTemplateDisplayText(' a ')).toBe(' a ');
    expect(toTemplateDisplayText('  ', 'x')).toBe('x');
    expect(resolveTemplateStyleLineHeight({ lineHeight: '', lineSpacing: 1.2 })).toBe(1.2);
    expect(resolveTemplateStyleLineHeight({ lineHeight: 0, lineSpacing: 1.2 })).toBe(0);
    expect(resolveTemplateStyleLineHeight(null)).toBeUndefined();
  });

  it('DOCE-TEMPLATES-1.3 writes a template font as a safe font stack', () => {
    expect(resolveTemplateFontFamilyCssText('Open Sans, SANS-SERIF')).toBe(
      '"Open Sans", sans-serif',
    );
    expect(resolveTemplateFontFamilyCssText('Arial')).toBe('Arial');
    expect(resolveTemplateFontFamilyCssText('"x"};</style>')).toBe('"x/style"');
    expect(resolveTemplateFontFamilyCssText('', 'serif')).toBe('serif');
    expect(resolveTemplateFontFamilyCssText('";{}', 'serif')).toBe('serif');
  });

  it('DOCE-TEMPLATES-1.3 writes a family the host serves as the stack it names', () => {
    const stacks = { Brand: '"Brand", Arial, sans-serif' };
    expect(resolveTemplateFontFamilyCssText('Brand', '', stacks)).toBe(stacks.Brand);
    expect(resolveTemplateFontFamilyCssText('constructor', '', stacks)).toBe('constructor');
  });
});
