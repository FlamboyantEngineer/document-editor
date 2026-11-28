import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { pagesState, stubEngine } from '../../test/pages-fixtures.js';
import { BASE_TEMPLATE } from '../model/index.js';
import {
  HARFBUZZJS_RELEASE,
  layoutInputs,
  layoutInputsKey,
  PRETEXT_RELEASE,
} from './layout-inputs.js';
import { pagesLayout } from './pages-layout.js';

const face = (bytes: number[]) => ({
  family: 'Lab Serif',
  weight: 400,
  style: 'normal' as const,
  bytes: new Uint8Array(bytes),
});

const base = {
  fonts: { faces: [face([1, 2, 3])], generics: { serif: 'Lab Serif' } },
  template: BASE_TEMPLATE,
  language: 'en',
  markup: 'all',
  codeLineNumbers: true,
  math: 'mathjax-4',
};

const installed = (name: string) =>
  (JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')) as { version: string })
    .version;

describe('layout inputs', () => {
  it('DOCE-PAGINATION-13.12 gives equal inputs the same key, however they were built', () => {
    const again = {
      ...base,
      fonts: { faces: [face([1, 2, 3])], generics: { serif: 'Lab Serif' } },
    };
    expect(layoutInputsKey(layoutInputs(again))).toBe(layoutInputsKey(layoutInputs(base)));
    expect(layoutInputsKey(layoutInputs(base))).toMatch(/^2-[0-9a-f]{16}$/);
  });

  it('DOCE-PAGINATION-13.12 names the input that differs, and changes the key', () => {
    const key = layoutInputsKey(layoutInputs(base));
    const changes = {
      fonts: { ...base, fonts: { faces: [face([1, 2, 4])], generics: base.fonts.generics } },
      generics: { ...base, fonts: { faces: base.fonts.faces, generics: { serif: 'Other' } } },
      template: { ...base, template: { ...BASE_TEMPLATE, id: 'other' } },
      language: { ...base, language: 'th' },
      markup: { ...base, markup: 'accepted' },
      codeLineNumbers: { ...base, codeLineNumbers: false },
      math: { ...base, math: null },
      rules: { ...base, rules: { signature: { size: () => ({ height: 20 }), sizeKey: 2 } } },
      hostViews: { ...base, hostViews: ['signature'] },
      refusedTextAtoms: { ...base, refusedTextAtoms: new Map([['citation', 'host draws it']]) },
    };
    for (const [name, changed] of Object.entries(changes)) {
      const inputs = layoutInputs(changed);
      const before = layoutInputs(base);
      const differing = Object.keys(inputs).filter(
        (each) => inputs[each as keyof typeof inputs] !== before[each as keyof typeof before],
      );
      expect(differing).toEqual([name]);
      expect(layoutInputsKey(inputs)).not.toBe(key);
    }
  });

  it('DOCE-PAGINATION-13.12 keys the rules that move blocks between pages, and the host views in any order', () => {
    const rules = (rule: object) => layoutInputs({ ...base, rules: { note: rule } }).rules;
    expect(rules({ keepsWithHeading: true })).not.toBe(rules({}));
    expect(rules({ endsPage: true })).not.toBe(rules({}));
    expect(rules({ split: () => null })).not.toBe(rules({}));
    expect(rules({ split: () => null })).toBe(rules({ split: () => ({}) }));
    const views = (hostViews: string[]) => layoutInputs({ ...base, hostViews }).hostViews;
    expect(views(['a', 'b'])).toBe(views(['b', 'a']));
  });

  it('DOCE-PAGINATION-13.12 DOCE-PAGINATION-14.1 keys the sized types by sizeKey, not by function', () => {
    const sizing = (sizeKey: number) => ({
      ...base,
      rules: { signature: { size: () => ({ height: 20 }), sizeKey }, heading: {} },
    });
    expect(layoutInputs(sizing(1)).rules).toBe(layoutInputs(sizing(1)).rules);
    expect(layoutInputs(sizing(1)).rules).not.toBe(layoutInputs(sizing(2)).rules);
    expect(layoutInputs({ ...base, rules: { heading: {} } }).rules).toBe('');
  });

  it('DOCE-PAGINATION-13.12 names the Pretext and harfbuzzjs releases installed', () => {
    expect(PRETEXT_RELEASE).toBe(installed('@chenglou/pretext'));
    expect(HARFBUZZJS_RELEASE).toBe(installed('harfbuzzjs'));
  });

  it('DOCE-PAGINATION-13.12 carries the engine’s inputs and their key on the pages’ layout', () => {
    const doc = documentSchema.topNodeType.createAndFill();
    if (!doc) throw new Error('no document');
    const layout = pagesLayout(pagesState(doc, stubEngine()));
    expect(layout?.inputs.markup).toBe('all');
    expect(layout?.inputsKey).toBe(layoutInputsKey(layout?.inputs ?? layoutInputs(base)));
  });
});
