// @vitest-environment node
import type { DOMOutputSpec } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { escapeHtmlAttribute, escapeHtmlText, readOutputSpec } from './html-output.js';

describe('html output', () => {
  it('DOCE-FORMAT-6.4 DOCE-EDITOR-6.27 escapes text and attribute values, no-break spaces on request', () => {
    expect(escapeHtmlText('a < b & c > d "e"')).toBe('a &lt; b &amp; c &gt; d "e"');
    expect(escapeHtmlText('a b', { nbsp: true })).toBe('a&nbsp;b');
    expect(escapeHtmlAttribute('"x" & <y>')).toBe('&quot;x&quot; &amp; &lt;y&gt;');
    expect(escapeHtmlAttribute('a b', { nbsp: true })).toBe('a&nbsp;b');
  });

  it('DOCE-FORMAT-6.4 DOCE-EDITOR-6.27 reads a spec by local names, leaving out attributes without a value', () => {
    const spec = [
      'http://www.w3.org/2000/svg svg',
      { 'http://www.w3.org/1999/xlink href': '#a', width: 3, hidden: null, title: undefined },
      ['g', 0],
    ] as const;
    expect(readOutputSpec(spec)).toEqual({
      tag: 'svg',
      attrs: [
        ['href', '#a'],
        ['width', '3'],
      ],
      children: [['g', 0]],
    });
    expect(readOutputSpec(['p', 0])).toEqual({ tag: 'p', attrs: [], children: [0] });
  });

  it('DOCE-FORMAT-6.4 refuses a spec that is a DOM node', () => {
    const node = { nodeType: 1 } as unknown as DOMOutputSpec;
    expect(() => readOutputSpec(node)).toThrow(
      'A static render needs output specs, not DOM nodes.',
    );
  });
});
