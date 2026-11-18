import { describe, expect, it } from 'vitest';
import { findNode, parseMarkup, roundTrip } from '../../../test/document-markup.js';

const captionLine = (kind: string, slot: string, text: string) =>
  `<div class="doc-caption-line ${slot}" data-caption-kind="${kind}"><span class="doc-caption-text" data-doc-caption-text="true">${text}</span><span class="doc-caption-continued" data-doc-caption-continued="true"></span></div>`;

describe('code nodes', () => {
  it('DOCE-SCHEMA-3.4 keeps a code block after its caption, with its language and starting line', () => {
    const html = `<div class="doc-code-figure">${captionLine('code', 'doc-code-caption-line', 'Set<em>up</em>')}<pre data-code-language="ts" spellcheck="false" data-code-block-continued="true" data-code-line-start="12"><code spellcheck="false">const a = 1;\n  return a;</code></pre></div>`;
    const doc = parseMarkup(html);
    const block = findNode(doc, 'code_block');
    expect(block?.attrs).toMatchObject({
      language: 'ts',
      codeBlockContinued: true,
      codeLineStart: 12,
    });
    expect(block?.textContent).toBe('const a = 1;\n  return a;');
    expect(findNode(doc, 'code_caption')?.textContent).toBe('Setup');
    expect(roundTrip(html)).toBe(html);
  });

  it('DOCE-SCHEMA-3.4 reads a plain pre element as plain text from line 1, with an empty caption', () => {
    const doc = parseMarkup('<pre><code>x</code></pre>');
    expect(findNode(doc, 'code_block')?.attrs).toMatchObject({
      language: 'plaintext',
      codeLineStart: 1,
    });
    expect(findNode(doc, 'code_figure')?.firstChild?.type.name).toBe('code_caption');
    expect(findNode(doc, 'code_caption')?.textContent).toBe('');
  });

  it('DOCE-SCHEMA-3.4 reads the caption a pasted code block drew in itself or named', () => {
    const drawn = `<pre data-code-language="ts">${captionLine('code', 'doc-code-caption-line', 'Old <strong>caption</strong>')}<code>y</code></pre>`;
    const drawnCaption = findNode(parseMarkup(drawn), 'code_caption');
    expect(drawnCaption?.textContent).toBe('Old caption');
    expect(drawnCaption?.child(1).marks.map((mark) => mark.type.name)).toEqual(['strong']);
    const named = '<pre data-code-caption-text="Named"><code>z</code></pre>';
    expect(findNode(parseMarkup(named), 'code_caption')?.textContent).toBe('Named');
  });

  it('DOCE-SCHEMA-3.4 keeps a linked code block and captions it with the file name', () => {
    const html = `<div data-linked-code-block="true" data-url="https://example.com/src/main.ts?raw=1" data-code-language="ts" data-start-line="3" class="linked-code-block"><pre data-code-language="ts" spellcheck="false">${captionLine('linked-code', 'doc-linked-code-caption-line', 'main.ts')}<code spellcheck="false">run();</code></pre></div>`;
    const block = findNode(parseMarkup(html), 'linked_code_block');
    expect(block?.attrs).toMatchObject({ code: 'run();', startLine: 3 });
    expect(roundTrip(html)).toBe(html);
  });

  it('DOCE-SCHEMA-3.4 keeps inline and display math as LaTeX text', () => {
    const inline = '<p>Area <span data-inline-type="latex" data-inline-content="">x^2</span></p>';
    const display = '<div class="math-node-display">\\frac{a}{b}</div>';
    expect(findNode(parseMarkup(inline), 'math_inline')?.textContent).toBe('x^2');
    expect(roundTrip(inline)).toBe(
      '<p>Area <span data-inline-type="latex" data-inline-content="x^2">x^2</span></p>',
    );
    expect(roundTrip(display)).toBe(
      '<div data-block-type="latex" data-latex-content="\\frac{a}{b}">\\frac{a}{b}</div>',
    );
  });
});
