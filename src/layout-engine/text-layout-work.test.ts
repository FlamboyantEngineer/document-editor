import type * as Pretext from '@chenglou/pretext';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../../test/canvas-fixtures.js';
import { documentSchema } from '../../test/document-markup.js';
import { BASE_TEMPLATE } from '../model/templates/base-template.js';
import type * as TemplateProperties from '../model/templates/template-properties.js';
import { createTextLayout } from './text-layout.js';

const pretext = vi.hoisted(() => ({ prepared: 0, merged: 0 }));

vi.mock('../model/templates/template-properties.js', async (original) => {
  const actual = await original<typeof TemplateProperties>();
  return {
    ...actual,
    templateScopeStyles: (...args: Parameters<typeof actual.templateScopeStyles>) => {
      pretext.merged += 1;
      return actual.templateScopeStyles(...args);
    },
  };
});

vi.mock('@chenglou/pretext', async (original) => {
  const actual = await original<typeof Pretext>();
  return {
    ...actual,
    prepare: (...args: Parameters<typeof actual.prepare>) => {
      pretext.prepared += 1;
      return actual.prepare(...args);
    },
  };
});

function paragraph(text: string): ProseMirrorNode {
  const node = documentSchema.nodes.paragraph?.create(null, documentSchema.text(text));
  if (!node) throw new Error('schema has no paragraph');
  return node;
}

beforeEach(() => {
  installFakeCanvas();
  pretext.prepared = 0;
  pretext.merged = 0;
});

describe('work the engine does again', () => {
  it('DOCE-PAGINATION-9.9 measures a number text once per engine', () => {
    const engine = createTextLayout({ template: BASE_TEMPLATE });
    const number = { label: '1.', level: 1, levelStyle: { styleConfig: null } };
    const lay = (text: string) => engine.layoutText(paragraph(text), { width: 400, number });
    lay('aaaa');
    const first = pretext.prepared;
    expect(first).toBeGreaterThan(0);
    // Another paragraph with the same number: its texts' widths are kept.
    for (let index = 0; index < 10; index += 1) lay(`bbbb ${String(index)}`);
    expect(pretext.prepared).toBe(first);
  });

  it('DOCE-PAGINATION-9.2 merges the styles of a scope once per template', () => {
    const template = { ...BASE_TEMPLATE };
    const engine = createTextLayout({ template });
    for (let index = 0; index < 10; index += 1)
      engine.layoutText(paragraph(`text ${String(index)}`), { width: 400 });
    expect(pretext.merged).toBe(1);
  });
});
