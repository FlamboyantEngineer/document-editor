import type * as Pretext from '@chenglou/pretext';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../../test/canvas-fixtures.js';
import { documentSchema, findNode, parseMarkup } from '../../test/document-markup.js';
import { BASE_TEMPLATE } from '../model/templates/base-template.js';
import type * as TemplateProperties from '../model/templates/template-properties.js';
import { lineMarks } from './line-marks.js';
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

  it('DOCE-PAGINATION-11.12 DOCE-PAGINATION-13.1 bounds child and hidden-range reads when drawing many lines', () => {
    const count = 256;
    const markup = '<b>aaaa </b><del data-id="removed">old </del><i>bbbb </i>';
    const node = findNode(parseMarkup(`<p>${markup.repeat(count)}</p>`), 'paragraph');
    if (!node) throw new Error('no paragraph');
    const laid = createTextLayout({ template: BASE_TEMPLATE, hidden: () => 'deletion' }).layoutText(
      node,
      { width: 60 },
    );
    if (!laid.ok) throw new Error(laid.reason);
    expect(laid.table.lines).toHaveLength(count);
    expect(laid.table.hidden).toHaveLength(count);

    let childReads = 0;
    node.forEach((child) => {
      const size = child.nodeSize;
      Object.defineProperty(child, 'nodeSize', {
        get() {
          childReads += 1;
          return size;
        },
      });
    });
    childReads = 0;
    let hiddenReads = 0;
    const hidden = laid.table.hidden?.map(([from, to]): [number, number] => {
      const range: [number, number] = [from, to];
      Object.defineProperties(range, {
        0: {
          get() {
            hiddenReads += 1;
            return from;
          },
        },
        1: {
          get() {
            hiddenReads += 1;
            return to;
          },
        },
      });
      return range;
    });
    const lines = laid.table.lines.map((line) => ({ ...line, left: 5 }));
    const marks = lineMarks(node, { ...laid.table, justify: true, hidden, lines });
    expect(marks.filter((mark) => mark.class.endsWith('__start'))).toHaveLength(count);
    expect(marks.filter((mark) => mark.class.endsWith('__end'))).toHaveLength(count - 1);
    expect(marks.filter((mark) => mark.class.endsWith('__justified'))).toHaveLength(count - 1);
    expect(childReads).toBeLessThanOrEqual(4 * node.childCount);
    expect(hiddenReads).toBeLessThanOrEqual(40 * count);
  });
});
