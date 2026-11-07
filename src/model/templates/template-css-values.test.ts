import { describe, expect, it } from 'vitest';
import { lengthToCssPx, MM_TO_CSS_PX, PAGE_SIZE_DIMENSIONS, resolveFontStack } from '../index.js';

describe('template CSS values', () => {
  it('DOCE-TEMPLATES-1.1 sizes pages and reads absolute lengths in pixels', () => {
    expect(PAGE_SIZE_DIMENSIONS.A4).toEqual({ width: '210mm', height: '297mm' });
    expect(PAGE_SIZE_DIMENSIONS['US Letter']).toEqual({ width: '8.5in', height: '11in' });
    expect(lengthToCssPx('1in')).toBe('96px');
    expect(lengthToCssPx('72pt')).toBe('96px');
    expect(lengthToCssPx('10mm')).toBe(`${String(10 * MM_TO_CSS_PX)}px`);
    expect(lengthToCssPx('1cm')).toBe(`${String(10 * MM_TO_CSS_PX)}px`);
    expect(lengthToCssPx(' 12px ')).toBe('12px');
    expect(lengthToCssPx('-3px')).toBe('0px');
    expect(lengthToCssPx('2em')).toBeNull();
    expect(lengthToCssPx('12')).toBeNull();
    expect(lengthToCssPx(null)).toBeNull();
  });

  it('DOCE-TEMPLATES-1.2 writes a template font as a safe font stack', () => {
    expect(resolveFontStack('Open Sans, SANS-SERIF')).toBe('"Open Sans", sans-serif');
    expect(resolveFontStack('Arial')).toBe('Arial');
    expect(resolveFontStack('"x"};</style>')).toBe('"x/style"');
    expect(resolveFontStack('', 'serif')).toBe('serif');
    expect(resolveFontStack(null, 'inherit')).toBe('inherit');
    expect(resolveFontStack('";{}', 'serif')).toBe('serif');
  });

  it('DOCE-TEMPLATES-1.2 writes a family the host serves as the stack it names', () => {
    const stacks = { Brand: '"Brand", Arial, sans-serif' };
    expect(resolveFontStack('Brand', '', stacks)).toBe(stacks.Brand);
    expect(resolveFontStack('constructor', '', stacks)).toBe('constructor');
  });
});
