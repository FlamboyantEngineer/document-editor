import { describe, expect, it } from 'vitest';
import type { TemplateFile } from '../model/index.js';
import { servedTemplate } from './served-template.js';

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

  it('DOCE-PAGINATION-12.5 keeps a generic no family is served for, and the template without any', () => {
    expect(servedTemplate(template, {})).toBe(template);
    const drawn = servedTemplate(template, { monospace: 'Lab Mono' });
    expect(drawn.styles?.paragraph).toEqual({ font: 'Serif', size: '11pt' });
  });
});
