// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { fontsourceFaces, harfBuzzWasm } from '../../test/font-files-node.js';
import { pagesState, stubEngine } from '../../test/pages-fixtures.js';
import type { FontFiles } from '../host/font-files.js';
import { createHostMeasurer } from '../layout-engine/font-files/measurer.js';
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
    expect(layoutInputsKey(layoutInputs(base))).toMatch(/^7-[0-9a-f]{16}$/);
  });

  it('DOCE-PAGINATION-13.12 ignores object key order throughout the resolved template', () => {
    const first = layoutInputs({
      ...base,
      template: {
        ...BASE_TEMPLATE,
        sections: [{ name: 'main', page: { margins: { top: '10mm', bottom: '12mm' } } }],
      },
    });
    const second = layoutInputs({
      ...base,
      template: {
        sections: [{ page: { margins: { bottom: '12mm', top: '10mm' } }, name: 'main' }],
        ...BASE_TEMPLATE,
      },
    });
    expect(second.template).toBe(first.template);
    expect(layoutInputsKey(second)).toBe(layoutInputsKey(first));
  });

  it('DOCE-PAGINATION-13.12 preserves the order of the template’s sections', () => {
    const first = layoutInputs({
      ...base,
      template: { ...BASE_TEMPLATE, sections: [{ name: 'intro' }, { name: 'main' }] },
    });
    const second = layoutInputs({
      ...base,
      template: { ...BASE_TEMPLATE, sections: [{ name: 'main' }, { name: 'intro' }] },
    });
    expect(second.template).not.toBe(first.template);
    expect(layoutInputsKey(second)).not.toBe(layoutInputsKey(first));
  });

  it.each([
    { choice: 'fallback family', otherFamily: 'Lab Mono', request: 'Missing Family' },
    { choice: 'matching face', otherFamily: 'Lab Sans', request: 'Lab Sans' },
  ])('DOCE-PAGINATION-13.12 keys the order that chooses the first $choice', async (test) => {
    const [sans] = fontsourceFaces('arimo', 'Lab Sans');
    const [mono] = fontsourceFaces('cousine', test.otherFamily);
    if (!sans || !mono) throw new Error('Missing reference fonts');
    const regular = { ...sans, style: 'normal' as const };
    const other = { ...mono, style: 'normal' as const };
    const shaper = harfBuzzWasm();
    const read = async (faces: FontFiles['faces']) => {
      const fonts = { faces };
      const { measurer, problems } = await createHostMeasurer(shaper, fonts);
      expect(problems).toEqual([]);
      const context = measurer.createContext();
      context.font = `16px "${test.request}"`;
      return { width: context.measureText('iiii').width, inputs: layoutInputs({ ...base, fonts }) };
    };
    const [first, second] = await Promise.all([read([regular, other]), read([other, regular])]);
    expect(second.width).not.toBe(first.width);
    expect(second.inputs.fonts).not.toBe(first.inputs.fonts);
    expect(layoutInputsKey(second.inputs)).not.toBe(layoutInputsKey(first.inputs));
  });

  describe('the font keys', () => {
    const named = (family: string, bytes: number[]) => ({ ...face(bytes), family });
    const fontsOf = (faces: FontFiles['faces'], generics?: FontFiles['generics']) =>
      layoutInputs({ ...base, fonts: { faces, generics } });

    it('DOCE-PAGINATION-13.12 gives the same key to families interleaved differently', () => {
      const first = fontsOf([named('A', [1]), named('B', [2]), named('A', [3]), named('B', [4])]);
      const second = fontsOf([named('A', [1]), named('A', [3]), named('B', [2]), named('B', [4])]);
      expect(second.fonts).toBe(first.fonts);
      expect(layoutInputsKey(second)).toBe(layoutInputsKey(first));
    });

    it('DOCE-PAGINATION-13.12 gives the same key to a duplicated face', () => {
      const once = fontsOf([named('A', [1]), named('A', [2])]);
      const twice = fontsOf([named('A', [2]), named('A', [1]), named('A', [2])]);
      expect(twice.fonts).toBe(once.fonts);
    });

    it('DOCE-PAGINATION-13.12 gives the same key to a family in another case or quoting', () => {
      const plain = fontsOf([named('Lab Serif', [1])], { serif: 'Lab Serif' });
      const quoted = fontsOf([named('"lab serif"', [1])], { serif: "'LAB SERIF'" });
      expect(quoted.fonts).toBe(plain.fonts);
      expect(quoted.generics).toBe(plain.generics);
    });

    it('DOCE-PAGINATION-13.12 keys the order of the faces within a family', () => {
      const first = fontsOf([named('A', [1]), named('A', [2])]);
      const second = fontsOf([named('A', [2]), named('A', [1])]);
      expect(second.fonts).not.toBe(first.fonts);
    });

    it('DOCE-PAGINATION-13.12 keys the fallback, the family served first', () => {
      const first = fontsOf([named('A', [1]), named('B', [2])]);
      const second = fontsOf([named('B', [2]), named('A', [1])]);
      expect(second.fonts).not.toBe(first.fonts);
      expect(layoutInputsKey(second)).not.toBe(layoutInputsKey(first));
    });
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

  it('DOCE-PAGINATION-13.12 records changes to page rules and host node view types', () => {
    const key = layoutInputsKey(layoutInputs(base));
    const changes = [
      { rules: { paragraph: { keepsWithHeading: true } } },
      { rules: { paragraph: { endsPage: true } } },
      { rules: { paragraph: { split: () => null } } },
      { hostViews: ['paragraph'] },
    ];
    const keys = changes.map((change) => layoutInputsKey(layoutInputs({ ...base, ...change })));
    expect(new Set([key, ...keys]).size).toBe(changes.length + 1);
  });

  it('DOCE-PAGINATION-13.12 keys rule settings and view types regardless of definition order', () => {
    const first = layoutInputs({
      ...base,
      rules: { heading: { keepsWithHeading: true }, paragraph: { split: () => null } },
      hostViews: ['image', 'signature'],
    });
    const second = layoutInputs({
      ...base,
      rules: { paragraph: { split: () => null }, heading: { keepsWithHeading: true } },
      hostViews: ['signature', 'image'],
    });
    expect(second.rules).toBe(first.rules);
    expect(layoutInputsKey(second)).toBe(layoutInputsKey(first));
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
