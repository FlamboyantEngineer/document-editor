// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BASE_TEMPLATE } from '../../templates/base-template.js';
import { mergeTemplateFiles } from '../template-format-resolve.js';
import { customStyleId, paragraphLevelStyleId, writeStylesPart } from './styles.js';

const template = mergeTemplateFiles(BASE_TEMPLATE, {
  formatVersion: 1,
  id: 'sample',
  styles: {
    paragraph: { font: 'Serif', size: '11pt', lineHeight: 1.4, spaceAfter: '6pt' },
    heading2: { size: '14pt', weight: 700, color: '#1f2937', alignment: 'center' },
    custom: { lead: { size: '13pt', italic: true }, quote: { color: '#4b5563' } },
  },
  footnotes: { text: { size: '8pt' } },
});

// The style element with an id, from the styles part.
function styleOf(part: string, id: string): string {
  return new RegExp(`<w:style [^>]*w:styleId="${id}">.*?</w:style>`).exec(part)?.[0] ?? '';
}

describe('writeStylesPart', () => {
  const part = writeStylesPart(template);

  it('DOCE-FORMAT-5.4 writes the paragraph style as Normal, in its font, size and spacing', () => {
    const normal = styleOf(part, 'Normal');
    expect(normal).toContain('w:default="1"');
    expect(normal).toContain('w:ascii="Times New Roman"');
    expect(normal).toContain('<w:sz w:val="22"/>');
    expect(normal).toContain(
      '<w:spacing w:before="0" w:after="120" w:line="336" w:lineRule="auto"/>',
    );
  });

  it('DOCE-FORMAT-5.4 writes headings with their outline level and the template title', () => {
    const heading = styleOf(part, 'Heading2');
    expect(heading).toContain('<w:name w:val="heading 2"/>');
    expect(heading).toContain('<w:keepNext/>');
    expect(heading).toContain('<w:jc w:val="center"/><w:outlineLvl w:val="1"/>');
    expect(heading).toContain('<w:b/>');
    expect(heading).toContain('<w:color w:val="1F2937"/><w:sz w:val="28"/>');
    expect(styleOf(part, 'Title')).toContain('<w:name w:val="Title"/>');
  });

  it('DOCE-FORMAT-5.4 writes paragraph levels and custom styles by their shared ids', () => {
    expect(paragraphLevelStyleId(1)).toBe('Normal');
    expect(paragraphLevelStyleId(3)).toBe('ParagraphLevel3');
    expect(styleOf(part, 'ParagraphLevel3')).toContain('<w:ind w:left="');
    expect(customStyleId('quote')).toBe('Custom_quote');
    const lead = styleOf(part, 'Custom_lead');
    expect(lead).toContain('<w:name w:val="lead"/>');
    expect(lead).toContain('<w:i/>');
    expect(lead).toContain('<w:sz w:val="26"/>');
    expect(styleOf(part, 'Custom_quote')).toContain('<w:color w:val="4B5563"/>');
    expect(styleOf(part, 'Quote')).toContain('<w:i/>');
  });

  it('DOCE-FORMAT-5.4 writes block styles from the template', () => {
    expect(styleOf(part, 'Code')).toContain('w:fill="F8FAFC"');
    expect(styleOf(part, 'Code')).toContain('w:ascii="Courier New"');
    expect(styleOf(part, 'TableHeader')).toContain('<w:color w:val="0F172A"/>');
    expect(styleOf(part, 'FootnoteText')).toContain('<w:sz w:val="16"/>');
    expect(part).toContain('w:styleId="FootnoteReference"');
    expect(part).toContain('w:styleId="CaptionLabel"');
    expect(part).toContain('w:styleId="Hyperlink"');
  });
});
