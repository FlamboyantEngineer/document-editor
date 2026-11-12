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

  it("DOCE-TEMPLATES-8.1 reads the reference and abbreviation list tokens and a host's own", () => {
    const lists = (tokens?: Record<string, string>) =>
      readTemplateContent(
        ['list_of_references', 'list_of_abbreviations', 'list_of_parts'].map((token) => ({
          type: 'paragraph',
          content: [{ type: 'text', text: `{{${token}}}` }],
        })),
        documentSchema,
        tokens ? { contentsTokens: tokens } : {},
      ).map((node) => (node.type.name === 'toc_block' ? String(node.attrs.tocType) : 'variable'));
    expect(lists()).toEqual(['references', 'abbreviations', 'variable']);
    expect(lists({ list_of_parts: 'parts' })).toEqual(['variable', 'variable', 'parts']);
  });

  it('DOCE-TEMPLATES-8.1 reads only the {{key}} form as a token', () => {
    const [node] = readTemplateContent(
      [{ type: 'paragraph', content: [{ type: 'text', text: '${document.name} [[page]] {{ }}' }] }],
      documentSchema,
    );
    expect(node?.childCount).toBe(1);
    expect(node?.textContent).toBe('${document.name} [[page]] {{ }}');
  });
});
