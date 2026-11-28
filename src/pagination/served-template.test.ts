import { describe, expect, it } from 'vitest';
import type { FontFaceFile } from '../host/font-files.js';
import type { TemplateFile } from '../model/index.js';
import { renameTemplateFonts, resolveServedTemplate } from './served-template.js';

const template = {
  styles: {
    paragraph: { font: 'Serif', size: '11pt' },
    heading1: { font: 'Arial' },
    codeBlock: { background: '#eee' },
  },
  sections: [{ name: 'notes', styles: { paragraph: { font: '"monospace"' } } }],
} as unknown as TemplateFile;

const face = (family: string): FontFaceFile => ({
  family,
  weight: 400,
  style: 'normal',
  bytes: new Uint8Array(0),
});

describe('resolveServedTemplate', () => {
  it('DOCE-PAGINATION-12.5 resolves generics and unset fonts and names unserved families', () => {
    const { template: drawn, unserved } = resolveServedTemplate(template, {
      faces: [face('Lab Serif'), face('Lab Mono')],
      generics: { serif: 'Lab Serif', monospace: 'Lab Mono' },
    });
    expect(drawn.styles).toEqual({
      paragraph: { font: 'Lab Serif', size: '11pt' },
      heading1: { font: 'Lab Serif' },
      codeBlock: { background: '#eee', font: 'Lab Mono' },
    });
    expect(drawn.sections?.[0]?.styles).toEqual({ paragraph: { font: 'Lab Mono' } });
    expect(unserved).toEqual(['Arial']);
  });

  it('DOCE-PAGINATION-12.5 uses the first served face if neither body nor generics were served', () => {
    const files = { faces: [face('Lab, Display'), face('Lab Mono')] };
    const { template: drawn, unserved } = resolveServedTemplate(template, files);
    expect(drawn.styles?.paragraph?.font).toBe('"Lab, Display"');
    expect(drawn.styles?.heading1?.font).toBe('"Lab, Display"');
    expect(drawn.styles?.codeBlock?.font).toBe('"Lab, Display"');
    expect(drawn.sections?.[0]?.styles?.paragraph?.font).toBe('"Lab, Display"');
    expect(unserved).toEqual(['Serif', 'Arial', 'monospace']);
    const unset = resolveServedTemplate({ ...template, styles: {} }, files).template;
    expect(unset.styles?.paragraph?.font).toBe('"Lab, Display"');
  });

  it('DOCE-PAGINATION-12.5 falls back to the first face of the body font stack', () => {
    const { template: drawn } = resolveServedTemplate(
      { ...template, styles: { ...template.styles, paragraph: { font: 'lab serif, Arial' } } },
      { faces: [face('Lab Mono'), face('Lab Serif')] },
    );
    expect(drawn.styles?.paragraph?.font).toBe('lab serif, Arial');
    expect(drawn.styles?.heading1?.font).toBe('lab serif');
    expect(drawn.styles?.codeBlock?.font).toBe('lab serif');
  });

  it('DOCE-PAGINATION-12.5 DOCE-PAGINATION-12.8 resolves and aliases families within a stack in order', () => {
    const styles = { paragraph: { font: 'A Family, "Another, Face", serif' } };
    const { template: portable } = resolveServedTemplate(
      { ...template, styles },
      { faces: [face('A Family'), face('Lab Serif')], generics: { serif: 'Lab Serif' } },
    );
    const aliased = renameTemplateFonts(portable, (font) =>
      font === 'A Family' ? 'A Family de-2' : font,
    );
    expect(aliased.styles?.paragraph?.font).toBe('A Family de-2, "Another, Face", Lab Serif');
  });

  it('DOCE-PAGINATION-12.5 keeps the original template without served faces', () => {
    for (const files of [null, { faces: [] }])
      expect(resolveServedTemplate(template, files)).toEqual({ template, unserved: [] });
  });
});
