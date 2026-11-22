import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { documentSchema, findNode, parseMarkup } from '../../test/document-markup.js';
import type { TemplateFile } from '../model/format/template-format.js';
import { BASE_TEMPLATE } from '../model/templates/base-template.js';
import { blockTypography, fontString, markedFont, resolveLength } from './typography.js';

const template: TemplateFile = {
  ...BASE_TEMPLATE,
  styles: {
    ...BASE_TEMPLATE.styles,
    custom: { Quote: { font: 'Georgia', italic: true, lineHeight: 2, spaceAfter: '1em' } },
  },
  sections: [
    {
      name: 'annex',
      styles: { paragraph: { size: '10px', alignment: 'justify' } },
    },
  ],
};

function first(markup: string, type: string): ProseMirrorNode {
  const node = findNode(parseMarkup(markup), type);
  if (!node) throw new Error(`no ${type} in ${markup}`);
  return node;
}

describe('typography', () => {
  it('DOCE-PAGINATION-9.2 takes a paragraph, a heading and the title from the template', () => {
    const paragraph = blockTypography(first('<p>a</p>', 'paragraph'), { template });
    expect(paragraph).toMatchObject({
      font: { family: 'Arial', size: 12, weight: 400, italic: false },
      leading: 18,
      align: 'left',
      marginTop: 0,
      marginBottom: 8,
      padding: 0,
    });
    const heading = blockTypography(first('<h2>a</h2>', 'heading'), { template });
    expect(heading).toMatchObject({ font: { size: 20, weight: 700 }, leading: 24 });
    const title = documentSchema.nodes.heading?.create({ level: 1, docTitle: true });
    expect(title && blockTypography(title, { template }).font.size).toBe(24);
  });

  it('DOCE-PAGINATION-9.2 takes a section scope over the template', () => {
    const paragraph = first('<p>a</p>', 'paragraph');
    const annex = blockTypography(paragraph, { template, scope: 'annex' });
    expect(annex).toMatchObject({
      font: { family: 'Arial', size: 10 },
      leading: 15,
      align: 'justify',
    });
  });

  it('DOCE-PAGINATION-9.2 truncates a leading to the layout unit, as Chromium does', () => {
    const at = (size: string, lineHeight: number) =>
      blockTypography(first('<p>a</p>', 'paragraph'), {
        template: { ...BASE_TEMPLATE, styles: { paragraph: { size, lineHeight } } },
      }).leading;
    // 11pt snaps to 14.671875px; times 1.4 is 20.540625, which Chromium draws as 20.53125.
    expect(at('11pt', 1.4)).toBe(20.53125);
    expect(at('13.7px', 1.5)).toBe(20.546875);
    expect(at('8pt', 1.5)).toBe(16);
  });

  it('DOCE-PAGINATION-9.2 resolves a relative paragraph size once, against the default size', () => {
    const at = (size: string) =>
      blockTypography(first('<p>a</p>', 'paragraph'), {
        template: { ...BASE_TEMPLATE, styles: { paragraph: { size, lineHeight: 1.5 } } },
      });
    expect(at('150%')).toMatchObject({ font: { size: 18 }, leading: 27 });
    expect(at('1.5em').font.size).toBe(18);
    // A heading's relative size still resolves against the paragraph's.
    const heading = blockTypography(first('<h1>a</h1>', 'heading'), {
      template: { ...BASE_TEMPLATE, styles: { paragraph: { size: '150%' } } },
    });
    expect(heading.font.size).toBe(36);
    // A custom style's relative size resolves against the paragraph's.
    const custom = blockTypography(
      documentSchema.nodes.paragraph?.create({ className: 'Big' }) ??
        first('<p>a</p>', 'paragraph'),
      {
        template: {
          ...BASE_TEMPLATE,
          styles: { paragraph: { size: '150%' }, custom: { Big: { size: '2em' } } },
        },
      },
    );
    expect(custom.font.size).toBe(36);
    // An unset heading takes 2em of the default paragraph size.
    const unset = { ...BASE_TEMPLATE, styles: {} };
    expect(blockTypography(first('<h1>a</h1>', 'heading'), { template: unset }).font.size).toBe(24);
  });

  it('DOCE-PAGINATION-9.2 lays a custom style over a paragraph and only its size and slant over a heading', () => {
    const paragraph = documentSchema.nodes.paragraph?.create({ className: 'Quote' });
    const heading = documentSchema.nodes.heading?.create({ level: 1, className: 'Quote' });
    if (!paragraph || !heading) throw new Error('schema has no paragraph or heading');
    expect(blockTypography(paragraph, { template })).toMatchObject({
      font: { family: 'Georgia', size: 12, weight: 400, italic: true },
      leading: 24,
      marginBottom: 12,
    });
    expect(blockTypography(heading, { template })).toMatchObject({
      font: { family: 'Arial', size: 22, weight: 700, italic: true },
    });
  });

  it('DOCE-PAGINATION-9.2 falls back as the reference stylesheet does', () => {
    const bare: TemplateFile = { formatVersion: 1, id: 'bare', name: 'Bare' };
    const paragraph = blockTypography(first('<p>a</p>', 'paragraph'), { template: bare });
    expect(paragraph).toMatchObject({ font: { family: 'serif', size: 12 }, leading: 18 });
    const heading = blockTypography(first('<h1>a</h1>', 'heading'), { template: bare });
    expect(heading).toMatchObject({ font: { family: 'serif', size: 24, weight: 700 } });
    expect(heading.leading).toBeCloseTo(28.8, 1);
    const code = blockTypography(first('<pre><code>a</code></pre>', 'code_block'), {
      template: bare,
    });
    expect(code).toMatchObject({ font: { family: 'monospace' }, padding: 8, codeSize: null });
    expect(resolveLength('50%', 12)).toBe(6);
    expect(resolveLength('2rem', 12)).toBe(32);
    expect(resolveLength('auto', 12)).toBeNull();
  });

  it('DOCE-PAGINATION-9.2 serves a family through the host font stacks', () => {
    const paragraph = blockTypography(first('<p>a</p>', 'paragraph'), {
      template,
      fontStacks: { Arial: '"Served Sans", sans-serif' },
    });
    expect(fontString(paragraph.font)).toBe('400 12px "Served Sans", sans-serif');
  });

  it('DOCE-PAGINATION-9.3 gives marks their fonts', () => {
    const doc = parseMarkup(
      '<p><strong>b</strong><em>i</em><code>c</code><sup>s</sup><sub><code>x</code></sub></p>',
    );
    const paragraph = findNode(doc, 'paragraph');
    if (!paragraph) throw new Error('no paragraph');
    const typography = blockTypography(paragraph, { template });
    const fonts: string[] = [];
    paragraph.forEach((child) => fonts.push(fontString(markedFont(typography, child.marks))));
    expect(fonts).toEqual([
      '700 12px Arial',
      'italic 400 12px Arial',
      '400 10px "Courier New"',
      '400 10px Arial',
      // Code is the outer element, so the subscript is smaller than the code's size.
      '400 8.328125px "Courier New"',
    ]);
    const heading = blockTypography(first('<h1>a</h1>', 'heading'), { template });
    const strong = documentSchema.marks.strong?.create();
    expect(strong && markedFont(heading, [strong]).weight).toBe(900);
  });
});
