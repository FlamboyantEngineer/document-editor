import { describe, expect, it } from 'vitest';
import type { TemplateFile } from '../../model/index.js';
import { customStyleNameError, withCustomStyleRenamed } from './custom-style-names.js';
import { DEFAULT_TEMPLATE_SETTINGS_LABELS as LABELS } from './template-settings.js';

const lead = (text: string) => ({
  type: 'paragraph',
  attrs: { className: 'lead' },
  content: [{ type: 'text', text }],
});

const TEMPLATE: TemplateFile = {
  formatVersion: 1,
  id: 'plain',
  styles: { custom: { lead: { size: '13pt' }, note: { size: '9pt' } } },
  header: { content: [lead('Top')] },
  sections: [
    {
      name: 'annex',
      styles: { custom: { lead: { color: '#333333' } } },
      content: [lead('Body')],
    },
  ],
  extensions: { styles: { custom: { lead: true } } },
};

describe('withCustomStyleRenamed', () => {
  it('DOCE-TEMPLATE-EDITOR-1.10 renames a style with its overrides and the blocks in it', () => {
    const next = withCustomStyleRenamed(TEMPLATE, 'lead', 'opening');
    expect(Object.keys(next.styles?.custom ?? {})).toEqual(['opening', 'note']);
    expect(next.sections?.[0]?.styles?.custom).toEqual({ opening: { color: '#333333' } });
    expect(next.header?.content).toEqual([{ ...lead('Top'), attrs: { className: 'opening' } }]);
    expect(next.sections?.[0]?.content).toEqual([
      { ...lead('Body'), attrs: { className: 'opening' } },
    ]);
    // The host's extensions are its own.
    expect(next.extensions).toEqual(TEMPLATE.extensions);
  });

  it('DOCE-TEMPLATE-EDITOR-1.10 deletes a style, its overrides, and takes it off its blocks', () => {
    const next = withCustomStyleRenamed(TEMPLATE, 'lead', null);
    expect(next.styles?.custom).toEqual({ note: { size: '9pt' } });
    expect(next.sections?.[0]?.styles?.custom).toEqual({});
    expect(next.header?.content).toEqual([{ ...lead('Top'), attrs: { className: '' } }]);
  });
});

describe('customStyleNameError', () => {
  const check = (name: string) =>
    customStyleNameError(name, { current: 'lead', taken: ['lead', 'note'], labels: LABELS });

  it('DOCE-TEMPLATE-EDITOR-1.10 says why a name may not be taken', () => {
    expect(check('lead')).toBeNull();
    expect(check('opening')).toBeNull();
    expect(check('note')).toBe(LABELS.styleNameTaken);
    expect(check('1st')).toBe(LABELS.styleNameInvalid);
  });
});
