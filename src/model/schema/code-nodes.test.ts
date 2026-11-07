import { describe, expect, it } from 'vitest';
import { findNode, parseMarkup, roundTrip } from '../../../test/document-markup.js';

const captionLine = (kind: string, slot: string, text: string) =>
  `<div class="doc-caption-line ${slot}" data-caption-kind="${kind}"><span class="doc-caption-text" data-doc-caption-text="true">${text}</span><span class="doc-caption-continued" data-doc-caption-continued="true"></span></div>`;

describe('code nodes', () => {
  it('DOCE-SCHEMA-3.4 keeps a code block with its language, caption and starting line', () => {
    const html = `<pre data-code-language="ts" data-code-caption-text="Setup" spellcheck="false" data-code-block-continued="true" data-code-line-start="12">${captionLine('code', 'doc-code-caption-line', 'Setup')}<code spellcheck="false">const a = 1;\n  return a;</code></pre>`;
    const block = findNode(parseMarkup(html), 'code_block');
    expect(block?.attrs).toMatchObject({
      language: 'ts',
      caption: 'Setup',
      codeBlockContinued: true,
      codeLineStart: 12,
    });
    expect(block?.textContent).toBe('const a = 1;\n  return a;');
    expect(roundTrip(html)).toBe(html);
  });

  it('DOCE-SCHEMA-3.4 reads a plain pre element as plain text from line 1', () => {
    const block = findNode(parseMarkup('<pre><code>x</code></pre>'), 'code_block');
    expect(block?.attrs).toMatchObject({ language: 'plaintext', caption: '', codeLineStart: 1 });
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
