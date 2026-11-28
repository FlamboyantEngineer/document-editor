import { Mark, type Node as ProseMirrorNode } from 'prosemirror-model';
import { beforeEach, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../../test/canvas-fixtures.js';
import { documentSchema } from '../../test/document-markup.js';
import { BASE_TEMPLATE } from '../model/templates/base-template.js';
import { insertedKey, type InsertedText } from './inserted-text.js';
import { buildRuns } from './runs.js';
import { createTextLayout } from './text-layout.js';

function paragraph(...children: ProseMirrorNode[]): ProseMirrorNode {
  const node = documentSchema.nodes.paragraph?.create(null, children);
  if (!node) throw new Error('schema has no paragraph');
  return node;
}

function variable(key: string): ProseMirrorNode {
  const node = documentSchema.nodes.template_variable?.create({ variableKey: key });
  if (!node) throw new Error('schema has no template variable');
  return node;
}

const texts = (node: ProseMirrorNode, inserted: readonly InsertedText[]) => {
  const engine = createTextLayout({ template: BASE_TEMPLATE });
  const runs = buildRuns({
    node,
    typography: engine.typography(node),
    variables: new Map([['document.title', 'vv']]),
    inserted,
  });
  if (!runs.ok) throw new Error(runs.reason);
  return runs.runs.map((run) => run.items.map((item) => ('text' in item ? item.text : '')));
};

beforeEach(() => {
  installFakeCanvas();
});

describe('inserted words in the engine’s runs', () => {
  it('DOCE-PAGINATION-11.11 lays words inserted at a template variable out before it', () => {
    const node = paragraph(
      documentSchema.text('aaaa '),
      variable('document.title'),
      documentSchema.text(' cc'),
    );
    // The page draws the words at the variable's offset before the variable, as at any atom.
    expect(texts(node, [{ offset: 5, pieces: ['xxxx '], sides: [-1] }])).toEqual([
      ['aaaa ', 'xxxx ', 'vv', ' cc'],
    ]);
  });

  it('DOCE-PAGINATION-11.11 starts a line inside an inserted word at the word, in no content', () => {
    const node = paragraph(documentSchema.text('aaaa bbbb'));
    const result = createTextLayout({ template: BASE_TEMPLATE }).layoutText(node, {
      width: 60,
      inserted: [{ offset: 5, pieces: ['xxxxxxxxxxxxxx '], sides: [-1] }],
    });
    if (!result.ok) throw new Error(result.reason);
    // The word, wider than the line, starts a line of its own, broken before it, and is broken
    // inside: the line after starts at the word's offset, not in the content after it, with no
    // break drawn, as the browser breaks the word's element there too.
    const lines = result.table.lines.map((line) => [line.from, line.to, line.side, line.inWord]);
    expect(lines).toEqual([
      [0, 5, undefined, undefined],
      [5, 5, -2, undefined],
      [5, 9, undefined, true],
    ]);
  });

  it('DOCE-PAGINATION-11.11 keys inserted words by their sides too', () => {
    const at = (sides: number[]): InsertedText[] => [{ offset: 5, pieces: ['xx ', 'yy '], sides }];
    expect(insertedKey(at([-4, -2]))).not.toBe(insertedKey(at([2, 4])));
    expect(insertedKey(at([-4, -2]))).toBe(insertedKey(at([-4, -2])));
  });
});

const mark = (name: string, attrs?: Record<string, unknown>) => {
  const made = documentSchema.marks[name]?.create(attrs);
  if (!made) throw new Error(`schema has no ${name} mark`);
  return made;
};

// 32px code at 1.5 takes a 48px box on a 12px paragraph's 18px line (DOCE-PAGINATION-9.5).
const TALL_CODE = {
  ...BASE_TEMPLATE,
  styles: {
    ...BASE_TEMPLATE.styles,
    codeBlock: { ...BASE_TEMPLATE.styles?.codeBlock, size: '32px' },
  },
};

function laid(node: ProseMirrorNode, options: { width?: number; template?: typeof BASE_TEMPLATE }) {
  const engine = createTextLayout({ template: options.template ?? BASE_TEMPLATE });
  const result = engine.layoutText(node, {
    width: options.width ?? 400,
    variables: new Map([['document.title', 'vv']]),
  });
  if (!result.ok) throw new Error(result.reason);
  return result.table;
}

describe('atoms and variables in their marks’ fonts', () => {
  it('DOCE-PAGINATION-9.5 grows a line to hold a text atom or a variable in a taller font', () => {
    const mention = documentSchema.nodes.mention?.create({ userId: 'u1', label: 'Ann' }, null, [
      mark('code'),
    ]);
    const title = documentSchema.nodes.template_variable?.create(
      { variableKey: 'document.title' },
      null,
      [mark('code')],
    );
    if (!mention || !title) throw new Error('schema has no mention or variable');
    for (const atom of [mention, title]) {
      const table = laid(paragraph(documentSchema.text('aa '), atom), { template: TALL_CODE });
      expect(table.lines.map((line) => line.height)).toEqual([48]);
    }
  });

  it('DOCE-PAGINATION-9.3 pads a variable in inline code and fits its line end in a link as the text’s', () => {
    const node = (marks: readonly ReturnType<typeof mark>[]) =>
      paragraph(
        documentSchema.text('aa '),
        documentSchema.nodes.template_variable?.create(
          { variableKey: 'document.title' },
          null,
          marks,
        ) ?? documentSchema.text('x'),
      );
    // Inline code adds 3px on each side, as to the same text.
    const written = paragraph(
      documentSchema.text('aa '),
      documentSchema.text('vv', [mark('code')]),
    );
    expect(laid(node([mark('code')]), {}).lines[0]?.width).toBe(laid(written, {}).lines[0]?.width);
    const engine = createTextLayout({ template: BASE_TEMPLATE });
    const linked = node([mark('link', { href: 'https://example.com' })]);
    const runs = buildRuns({
      node: linked,
      typography: engine.typography(linked),
      variables: new Map([['document.title', 'vv']]),
    });
    if (!runs.ok) throw new Error(runs.reason);
    expect(runs.runs[0]?.items[1]).toMatchObject({ text: 'vv', accurateLineEnds: true });
  });
});

describe('inline code boxes', () => {
  const code = mark('code');
  const text = (value: string, ...marks: ReturnType<typeof mark>[]) =>
    documentSchema.text(value, Mark.setFrom(marks));
  const width = (children: ProseMirrorNode[], hidden?: string) => {
    const node = paragraph(...children);
    const engine = createTextLayout({ template: BASE_TEMPLATE, hidden: () => hidden ?? null });
    const result = engine.layoutText(node, { width: 400 });
    if (!result.ok) throw new Error(result.reason);
    return result.table.lines[0]?.width ?? 0;
  };

  it('DOCE-PAGINATION-9.3 pads each inline code element once, however many text nodes it holds', () => {
    const one = width([text('aabb', code)]);
    // Underline comes after code in the schema's mark order, so one `code` element holds both
    // nodes, padded once on each side.
    expect(width([text('aa', code), text('bb', code, mark('underline'))])).toBe(one);
    // Strong comes before it: `<code>aa</code><strong><code>bb</code></strong>`, two elements.
    expect(width([text('aa', code), text('bb', code, mark('strong'))])).toBe(one + 6);
    // Hidden content drawn in the element keeps it whole; hidden content outside it ends it.
    const deletion = mark('deletion', { id: 's1' });
    expect(
      width([text('aa', code), text('xx', code, deletion), text('bb', code)], 'deletion'),
    ).toBe(one);
    expect(width([text('aa', code), text('xx', deletion), text('bb', code)], 'deletion')).toBe(
      one + 6,
    );
    // Words inserted between them are drawn outside it, and end it.
    const node = paragraph(text('aa', code), text('bb', code));
    const result = createTextLayout({ template: BASE_TEMPLATE }).layoutText(node, {
      width: 400,
      inserted: [{ offset: 2, pieces: ['x'], sides: [-1] }],
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.table.lines[0]?.width).toBe(one + 6 + 6);
  });
});
