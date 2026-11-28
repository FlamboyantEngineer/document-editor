import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { beforeEach, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../../test/canvas-fixtures.js';
import { documentSchema } from '../../test/document-markup.js';
import { BASE_TEMPLATE } from '../model/templates/base-template.js';
import { textWidth } from './metrics.js';
import { createTextLayout, type TextLayoutOptions } from './text-layout.js';
import { fontString } from './typography.js';

const mark = (name: string, attrs?: Record<string, unknown>) => {
  const made = documentSchema.marks[name]?.create(attrs);
  if (!made) throw new Error(`schema has no ${name} mark`);
  return made;
};

function create(type: string, children: ProseMirrorNode[], attrs?: Record<string, unknown>) {
  const node = documentSchema.nodes[type]?.create(attrs ?? null, children);
  if (!node) throw new Error(`schema has no ${type}`);
  return node;
}

function laid(node: ProseMirrorNode, options: Partial<TextLayoutOptions>, label?: string) {
  const result = createTextLayout({ template: BASE_TEMPLATE, ...options }).layoutText(node, {
    width: 60,
    label,
  });
  if (!result.ok) throw new Error(result.reason);
  return result.table;
}

// Reserves each ☃, at the font's size.
const reserve = (cluster: string, font: string) =>
  cluster === '☃' ? Number(/(\d+)px/u.exec(font)?.[1]) : null;

beforeEach(() => {
  installFakeCanvas();
});

describe('reserved boxes of unbreakable items', () => {
  it('DOCE-PAGINATION-12.4 reserves the clusters of a citation’s identifier as of any text', () => {
    const reference = mark('reference', {
      refType: 'external-document',
      referenceBaseline: JSON.stringify({
        version: 1,
        documentId: 'doc-7',
        numbering: 'SYS☃',
        title: 'Requirements',
        revisionLabel: 'Rev B',
        defaultLabel: 'SYS☃',
      }),
    });
    const node = create('paragraph', [
      documentSchema.text('aa '),
      documentSchema.text('SYS☃', [reference]),
    ]);
    expect(laid(node, { reserve }).reserved).toEqual([{ from: 6, to: 7, width: 12 }]);
  });

  it('DOCE-PAGINATION-12.4 draws a text atom with a reserved cluster in a box of its whole width', () => {
    const mention = documentSchema.nodes.mention?.create({ userId: 'u1', label: 'A☃' });
    if (!mention) throw new Error('schema has no mention');
    const node = create('paragraph', [documentSchema.text('aa '), mention]);
    const font = fontString(createTextLayout({ template: BASE_TEMPLATE }).typography(node).font);
    // The atom is one element the page cannot reach inside: its box is the whole atom.
    expect(laid(node, { reserve }).reserved).toEqual([
      { from: 3, to: 4, width: textWidth('@A☃', font) },
    ]);
    expect(laid(create('paragraph', [documentSchema.text('aa ')]), { reserve }).reserved).toBe(
      undefined,
    );
  });
});

describe('caption labels', () => {
  it('DOCE-PAGINATION-9.11 records a label that ends its line though hidden content starts the caption', () => {
    const caption = (hidden: boolean) =>
      create('table_caption', [
        ...(hidden ? [documentSchema.text('xx', [mark('deletion', { id: 's1' })])] : []),
        documentSchema.text('ffffffffff'),
      ]);
    // `Table 1 - ` is 51px: the content goes on the next line, so the label ends its own.
    const plain = laid(caption(false), {}, 'Table 1 - ');
    expect(plain.label).toBe('Table 1 - \n');
    const hidden = laid(caption(true), { hidden: () => 'deletion' }, 'Table 1 - ');
    expect(hidden.lines.map((line) => line.from)).toEqual([0, 2]);
    expect(hidden.label).toBe('Table 1 - \n');
  });
});

describe('line widths', () => {
  it('DOCE-PAGINATION-9.1 leaves the spaces that end a block out of its last line’s width, as a wrapped line’s', () => {
    const right = {
      ...BASE_TEMPLATE,
      styles: {
        ...BASE_TEMPLATE.styles,
        paragraph: { ...BASE_TEMPLATE.styles?.paragraph, alignment: 'right' as const },
      },
    };
    const line = (text: string) => {
      const first = laid(create('paragraph', [documentSchema.text(text)]), { template: right })
        .lines[0];
      return [first?.width, first?.left];
    };
    // Chromium hangs them at the block's end in pre-wrap: the line sits at the right edge.
    expect(line('aaa bbb ')).toEqual(line('aaa bbb'));
    expect(line('aaa bbb   ')).toEqual(line('aaa bbb'));
    // Spaces before a hard break hang only where they do not fit, so they are kept.
    const broken = laid(
      create('paragraph', [documentSchema.text('aaa '), create('hard_break', [])]),
      {
        template: right,
      },
    );
    // `aaa ` is 21px with the fake Canvas.
    expect(broken.lines[0]?.width).toBe(21);
  });
});
