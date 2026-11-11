import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { readTemplateContent } from './template-content.js';

describe('template content', () => {
  it('DOCE-TEMPLATES-8.1 reads tokens as live variables and list tokens as lists of contents', () => {
    const [heading, list] = readTemplateContent(
      [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'For {{ document.name }}, page {{page.current}}.' }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: '{{table_of_contents}}' }] },
      ],
      documentSchema,
    );
    const parts: string[] = [];
    heading?.forEach((child) =>
      parts.push(
        child.type.name === 'template_variable'
          ? `[${String(child.attrs.variableKey)}]`
          : (child.text ?? ''),
      ),
    );
    expect(parts).toEqual(['For ', '[document.name]', ', page ', '[page.current]', '.']);
    expect(list?.type.name).toBe('toc_block');
    expect(list?.attrs.tocType).toBe('toc');
  });
});
