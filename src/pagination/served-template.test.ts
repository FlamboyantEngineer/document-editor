import { describe, expect, it } from 'vitest';
import type { TemplateFile } from '../model/index.js';
import { renameTemplateFonts, servedFamiliesOnly, servedTemplate } from './served-template.js';

const template = {
  styles: {
    paragraph: { font: 'Serif', size: '11pt' },
    heading1: { font: 'Arial' },
    codeBlock: { background: '#eee' },
  },
  sections: [{ name: 'notes', styles: { paragraph: { font: '"monospace"' } } }],
} as unknown as TemplateFile;

describe('servedTemplate', () => {
  it('DOCE-PAGINATION-12.5 names the served family for each generic keyword and unset font', () => {
    const drawn = servedTemplate(template, { serif: 'Lab Serif', monospace: 'Lab Mono' });
    expect(drawn.styles).toEqual({
      paragraph: { font: 'Lab Serif', size: '11pt' },
      heading1: { font: 'Arial' },
      codeBlock: { background: '#eee', font: 'Lab Mono' },
    });
    expect(drawn.sections?.[0]?.styles).toEqual({ paragraph: { font: 'Lab Mono' } });
  });

  it('DOCE-PAGINATION-12.5 DOCE-PAGINATION-12.8 resolves and aliases families within a stack in order', () => {
    const styles = { paragraph: { font: 'A Family, "Another, Face", serif' } };
    const served = servedTemplate({ ...template, styles }, { serif: 'Lab Serif' });
    const aliased = renameTemplateFonts(served, (font) =>
      font === 'A Family' ? 'A Family de-2' : font,
    );
    expect(aliased.styles?.paragraph?.font).toBe('A Family de-2, "Another, Face", Lab Serif');
  });

  it('DOCE-PAGINATION-12.5 keeps a generic no family is served for, and the template without any', () => {
    expect(servedTemplate(template, {})).toBe(template);
    const drawn = servedTemplate(template, { monospace: 'Lab Mono' });
    expect(drawn.styles?.paragraph).toEqual({ font: 'Serif', size: '11pt' });
  });
});

describe('servedFamiliesOnly', () => {
  const served = new Set(['Lab Serif', 'Lab Mono']);
  const isServed = (family: string) => served.has(family);

  it('DOCE-PAGINATION-12.5 draws each font whose first family no file serves in the served body family, and names it', () => {
    const drawn = servedTemplate(template, { serif: 'Lab Serif', monospace: 'Lab Mono' });
    const only = servedFamiliesOnly(drawn, { isServed, fallback: 'Lab Serif' });
    expect(only.template.styles).toEqual({
      paragraph: { font: 'Lab Serif', size: '11pt' },
      heading1: { font: 'Lab Serif' },
      codeBlock: { background: '#eee', font: 'Lab Mono' },
    });
    expect(only.unserved).toEqual(['Arial']);
  });

  it('DOCE-PAGINATION-12.5 keeps a template whose fonts are all served', () => {
    const drawn = servedTemplate(
      { ...template, styles: { paragraph: { font: 'Lab Serif, Arial' } } } as TemplateFile,
      { monospace: 'Lab Mono' },
    );
    expect(servedFamiliesOnly(drawn, { isServed, fallback: 'Lab Serif' })).toEqual({
      template: drawn,
      unserved: [],
    });
  });
});
