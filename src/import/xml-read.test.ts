import { describe, expect, it } from 'vitest';
import { childElement, childValue, findElements, readXml } from './xml-read.js';

describe('reading XML parts', () => {
  it('DOCE-IMPORT-2.1 reads elements, attributes, entities, CDATA and skips comments', () => {
    const root = readXml(
      `<?xml version="1.0"?><w:p a="1 &amp; 2" b='&#x41;'><!-- note --><w:t>x &lt; y&#160;</w:t><w:t><![CDATA[<raw>]]></w:t><w:br/></w:p>`,
    );
    expect(root.name).toBe('w:p');
    expect(root.attrs).toEqual({ a: '1 & 2', b: 'A' });
    expect(findElements(root, 'w:t').map((t) => t.children.join(''))).toEqual(['x < y ', '<raw>']);
    expect(childElement(root, 'w:br')).toEqual({ name: 'w:br', attrs: {}, children: [] });
    expect(childValue(readXml('<a><b w:val="v"/></a>'), 'b')).toBe('v');
  });

  it('DOCE-IMPORT-2.1 fails on markup that is not well formed', () => {
    for (const source of ['<a><b></a>', '<a>', '<a', '<!-- open', '', 'text only']) {
      expect(() => readXml(source), source).toThrow(
        expect.objectContaining({ name: 'ImportError', failure: 'damaged' }),
      );
    }
  });

  it('DOCE-IMPORT-2.14 refuses document types and elements nested too deep', () => {
    for (const source of [
      '<!DOCTYPE a [<!ENTITY x "y">]><a>&x;</a>',
      '<!DOCTYPE a SYSTEM "file:///etc/passwd"><a/>',
    ]) {
      expect(() => readXml(source), source).toThrow(
        expect.objectContaining({ name: 'ImportError', failure: 'refused' }),
      );
    }
    const nested = (depth: number) => `${'<a>'.repeat(depth)}${'</a>'.repeat(depth)}`;
    expect(() => readXml(nested(256))).not.toThrow();
    expect(() => readXml(nested(257))).toThrow(
      expect.objectContaining({ name: 'ImportError', failure: 'too-large' }),
    );
    expect(() => readXml(nested(5), 4)).toThrow(expect.objectContaining({ failure: 'too-large' }));
  });
});
